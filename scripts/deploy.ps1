# LibraryCoverStudio 部署脚本 (Windows)
# 用于 PowerShell 环境

param(
    [Parameter(Position=0)]
    [string]$Command = "start"
)

# 颜色输出函数
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# 检查依赖
function Test-Dependencies {
    Write-Info "检查依赖..."
    
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "Docker 未安装，请先安装 Docker Desktop"
        exit 1
    }
    
    if (!(Get-Command docker-compose -ErrorAction SilentlyContinue)) {
        Write-Error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    }
    
    if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Info "pnpm 未安装，正在安装..."
        & npm install -g pnpm@8.15.0
        if ($LASTEXITCODE -ne 0) {
            Write-Error "pnpm 安装失败，请手动安装"
            exit 1
        }
        Write-Success "pnpm 安装完成"
    } else {
        Write-Success "pnpm 已安装"
    }
    
    Write-Success "依赖检查完成"
}

# 创建环境配置
function New-EnvironmentConfig {
    if (!(Test-Path ".env")) {
        Write-Info "创建环境配置文件..."
        Copy-Item ".env.example" ".env"
        Write-Warning "请编辑 .env 文件设置数据库密码等配置"
        Write-Info "至少需要设置以下变量："
        Write-Host "  - POSTGRES_PASSWORD"
        Write-Host "  - JWT_SECRET"
        Read-Host "按回车键继续..."
    } else {
        Write-Success "环境配置文件已存在"
    }
}

# 创建必要目录
function New-RequiredDirectories {
    Write-Info "创建必要目录..."
    
    $directories = @(
        "uploads\posters",
        "uploads\previews", 
        "logs",
        "nginx\ssl"
    )
    
    foreach ($dir in $directories) {
        if (!(Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
    
    Write-Success "目录创建完成"
}

# 启动服务
function Start-Services {
    Write-Info "启动 LibraryCoverStudio 服务..."
    
    # 构建镜像
    & docker-compose build --no-cache
    if ($LASTEXITCODE -ne 0) {
        Write-Error "镜像构建失败"
        exit 1
    }
    
    # 启动服务
    & docker-compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Error "服务启动失败"
        exit 1
    }
    
    Write-Success "服务启动完成"
    
    # 等待服务就绪
    Write-Info "等待服务就绪..."
    Start-Sleep -Seconds 30
    
    # 检查服务状态
    Test-ServiceStatus
}

# 检查服务状态
function Test-ServiceStatus {
    Write-Info "检查服务状态..."
    
    # 检查数据库
    $dbStatus = & docker-compose exec -T postgres pg_isready -U postgres 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "PostgreSQL 数据库运行正常"
    } else {
        Write-Error "PostgreSQL 数据库启动失败"
        return $false
    }
    
    # 检查 Redis
    $redisStatus = & docker-compose exec -T redis redis-cli ping 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Redis 缓存运行正常"
    } else {
        Write-Error "Redis 缓存启动失败"
        return $false
    }
    
    # 检查应用
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Success "LibraryCoverStudio 应用运行正常"
        }
    } catch {
        Write-Warning "LibraryCoverStudio 应用可能还在启动中..."
    }
    
    Write-Success "服务状态检查完成"
    return $true
}

# 显示访问信息
function Show-AccessInfo {
    Write-Host ""
    Write-Host "🎉 LibraryCoverStudio 启动成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "📱 访问地址："
    Write-Host "  🌐 Web 界面: http://localhost:3001"
    Write-Host "  📊 健康检查: http://localhost:3001/health"
    Write-Host ""
    Write-Host "🔧 管理命令："
    Write-Host "  查看日志: docker-compose logs -f"
    Write-Host "  重启服务: docker-compose restart"
    Write-Host "  停止服务: docker-compose down"
    Write-Host "  查看状态: docker-compose ps"
    Write-Host ""
    Write-Host "📖 更多信息请查看 QUICKSTART.md"
    Write-Host ""
}

# 停止服务
function Stop-Services {
    Write-Info "停止 LibraryCoverStudio 服务..."
    & docker-compose down
    Write-Success "服务已停止"
}

# 重启服务
function Restart-Services {
    Write-Info "重启 LibraryCoverStudio 服务..."
    & docker-compose restart
    Write-Success "服务已重启"
}

# 查看日志
function Show-Logs {
    Write-Info "显示应用日志..."
    & docker-compose logs -f
}

# 清理数据
function Clear-Data {
    $confirmation = Read-Host "确定要清理所有数据吗？这将删除数据库和上传的文件 [y/N]"
    if ($confirmation -eq "y" -or $confirmation -eq "Y") {
        Write-Warning "清理数据..."
        & docker-compose down -v
        & docker system prune -f
        Remove-Item -Recurse -Force "uploads", "logs" -ErrorAction SilentlyContinue
        Write-Success "数据清理完成"
    } else {
        Write-Info "取消清理"
    }
}

# 显示帮助信息
function Show-Help {
    Write-Host "LibraryCoverStudio 管理脚本 (Windows)"
    Write-Host ""
    Write-Host "用法: .\deploy.ps1 [命令]"
    Write-Host ""
    Write-Host "命令:"
    Write-Host "  start    启动所有服务（默认）"
    Write-Host "  stop     停止所有服务"
    Write-Host "  restart  重启所有服务"
    Write-Host "  status   查看服务状态"
    Write-Host "  logs     查看应用日志"
    Write-Host "  clean    清理所有数据"
    Write-Host "  help     显示此帮助信息"
    Write-Host ""
}

# 主函数
switch ($Command.ToLower()) {
    "start" {
        Test-Dependencies
        New-EnvironmentConfig
        New-RequiredDirectories
        Start-Services
        Show-AccessInfo
    }
    "stop" {
        Stop-Services
    }
    "restart" {
        Restart-Services
    }
    "status" {
        & docker-compose ps
        Test-ServiceStatus
    }
    "logs" {
        Show-Logs
    }
    "clean" {
        Clear-Data
    }
    "help" {
        Show-Help
    }
    default {
        Write-Error "未知命令: $Command"
        Show-Help
        exit 1
    }
}