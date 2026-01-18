#!/bin/bash

# LibraryCoverStudio 启动脚本
# 用于快速部署和管理应用

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Docker 和 Docker Compose
check_dependencies() {
    log_info "检查依赖..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    log_success "依赖检查完成"
}

# 创建环境配置
setup_env() {
    if [ ! -f .env ]; then
        log_info "创建环境配置文件..."
        cp .env.example .env
        log_warning "请编辑 .env 文件设置数据库密码等配置"
        log_info "至少需要设置以下变量："
        echo "  - POSTGRES_PASSWORD"
        echo "  - JWT_SECRET"
        read -p "按回车键继续..."
    else
        log_success "环境配置文件已存在"
    fi
}

# 创建必要目录
create_directories() {
    log_info "创建必要目录..."
    
    mkdir -p uploads/posters
    mkdir -p uploads/previews
    mkdir -p logs
    mkdir -p nginx/ssl
    
    log_success "目录创建完成"
}

# 启动服务
start_services() {
    log_info "启动 LibraryCoverStudio 服务..."
    
    # 构建镜像
    docker-compose build --no-cache
    
    # 启动服务
    docker-compose up -d
    
    log_success "服务启动完成"
    
    # 等待服务就绪
    log_info "等待服务就绪..."
    sleep 30
    
    # 检查服务状态
    check_services
}

# 检查服务状态
check_services() {
    log_info "检查服务状态..."
    
    # 检查数据库
    if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        log_success "PostgreSQL 数据库运行正常"
    else
        log_error "PostgreSQL 数据库启动失败"
        return 1
    fi
    
    # 检查 Redis
    if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_success "Redis 缓存运行正常"
    else
        log_error "Redis 缓存启动失败"
        return 1
    fi
    
    # 检查应用
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        log_success "LibraryCoverStudio 应用运行正常"
    else
        log_warning "LibraryCoverStudio 应用可能还在启动中..."
    fi
    
    log_success "服务状态检查完成"
}

# 显示访问信息
show_access_info() {
    echo ""
    echo "🎉 LibraryCoverStudio 启动成功！"
    echo ""
    echo "📱 访问地址："
    echo "  🌐 Web 界面: http://localhost:3001"
    echo "  📊 健康检查: http://localhost:3001/health"
    echo ""
    echo "🔧 管理命令："
    echo "  查看日志: docker-compose logs -f"
    echo "  重启服务: docker-compose restart"
    echo "  停止服务: docker-compose down"
    echo "  查看状态: docker-compose ps"
    echo ""
    echo "📖 更多信息请查看 QUICKSTART.md"
    echo ""
}

# 停止服务
stop_services() {
    log_info "停止 LibraryCoverStudio 服务..."
    docker-compose down
    log_success "服务已停止"
}

# 重启服务
restart_services() {
    log_info "重启 LibraryCoverStudio 服务..."
    docker-compose restart
    log_success "服务已重启"
}

# 查看日志
show_logs() {
    log_info "显示应用日志..."
    docker-compose logs -f
}

# 清理数据
clean_data() {
    read -p "确定要清理所有数据吗？这将删除数据库和上传的文件 [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_warning "清理数据..."
        docker-compose down -v
        docker system prune -f
        rm -rf uploads logs
        log_success "数据清理完成"
    else
        log_info "取消清理"
    fi
}

# 显示帮助信息
show_help() {
    echo "LibraryCoverStudio 管理脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  start    启动所有服务（默认）"
    echo "  stop     停止所有服务"
    echo "  restart  重启所有服务"
    echo "  status   查看服务状态"
    echo "  logs     查看应用日志"
    echo "  clean    清理所有数据"
    echo "  help     显示此帮助信息"
    echo ""
}

# 主函数
main() {
    case "${1:-start}" in
        "start")
            check_dependencies
            setup_env
            create_directories
            start_services
            show_access_info
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            restart_services
            ;;
        "status")
            docker-compose ps
            check_services
            ;;
        "logs")
            show_logs
            ;;
        "clean")
            clean_data
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"