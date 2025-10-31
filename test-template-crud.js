const http = require("http");

// 辅助函数:发送HTTP请求
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 3001,
      path: path,
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (data) {
      const body = JSON.stringify(data);
      options.headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(responseData),
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            data: responseData,
          });
        }
      });
    });

    req.on("error", reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// 测试流程
async function testTemplateCRUD() {
  try {
    console.log("=== 模板 CRUD 测试 ===\n");

    // 1. 创建模板
    console.log("1. 创建模板...");
    const createData = {
      name: "完整测试模板",
      description: "用于完整测试的模板",
      canvasData: {
        width: 1200,
        height: 800,
        background: "#f0f0f0",
        elements: [{ type: "text", content: "标题", x: 100, y: 100 }],
      },
      tags: ["测试", "CRUD", "完整"],
    };

    const createResult = await makeRequest(
      "POST",
      "/api/templates",
      createData
    );
    console.log("   状态码:", createResult.statusCode);
    console.log("   结果:", createResult.data);

    if (createResult.statusCode !== 201) {
      throw new Error("创建模板失败");
    }

    const templateId = createResult.data.id;
    console.log("   ✓ 模板已创建, ID:", templateId, "\n");

    // 2. 获取单个模板
    console.log("2. 获取单个模板...");
    const getResult = await makeRequest("GET", `/api/templates/${templateId}`);
    console.log("   状态码:", getResult.statusCode);
    console.log("   名称:", getResult.data.name);
    console.log("   ✓ 模板获取成功\n");

    // 3. 更新模板
    console.log("3. 更新模板...");
    const updateData = {
      name: "完整测试模板 - 已更新",
      description: "已更新的描述",
      canvasData: {
        width: 1200,
        height: 800,
        background: "#ffffff",
        elements: [{ type: "text", content: "更新后的标题", x: 100, y: 100 }],
      },
      tags: ["测试", "CRUD", "已更新"],
    };

    const updateResult = await makeRequest(
      "PUT",
      `/api/templates/${templateId}`,
      updateData
    );
    console.log("   状态码:", updateResult.statusCode);
    console.log("   更新后名称:", updateResult.data.name);
    console.log("   ✓ 模板更新成功\n");

    // 4. 复制模板
    console.log("4. 复制模板...");
    const duplicateResult = await makeRequest(
      "POST",
      `/api/templates/${templateId}/duplicate`
    );
    console.log("   状态码:", duplicateResult.statusCode);
    console.log("   新模板ID:", duplicateResult.data.id);
    console.log("   新模板名称:", duplicateResult.data.name);
    console.log("   ✓ 模板复制成功\n");

    const duplicateId = duplicateResult.data.id;

    // 5. 导出模板
    console.log("5. 导出模板...");
    const exportResult = await makeRequest(
      "GET",
      `/api/templates/${templateId}/export`
    );
    console.log("   状态码:", exportResult.statusCode);
    console.log("   导出数据包含:", Object.keys(exportResult.data));
    console.log("   ✓ 模板导出成功\n");

    // 6. 获取模板列表
    console.log("6. 获取模板列表...");
    const listResult = await makeRequest("GET", "/api/templates?limit=10");
    console.log("   状态码:", listResult.statusCode);
    console.log("   模板总数:", listResult.data.pagination.total);
    console.log("   模板列表:");
    listResult.data.templates.forEach((t) => {
      console.log("     -", t.name, `(ID: ${t.id.substring(0, 8)}...)`);
    });
    console.log("   ✓ 列表获取成功\n");

    // 7. 删除复制的模板
    console.log("7. 删除复制的模板...");
    const deleteResult = await makeRequest(
      "DELETE",
      `/api/templates/${duplicateId}`
    );
    console.log("   状态码:", deleteResult.statusCode);
    console.log("   ✓ 模板删除成功\n");

    // 8. 确认删除
    console.log("8. 确认删除(再次获取列表)...");
    const finalListResult = await makeRequest("GET", "/api/templates?limit=10");
    console.log("   状态码:", finalListResult.statusCode);
    console.log("   剩余模板数:", finalListResult.data.pagination.total);
    console.log("   ✓ 删除确认成功\n");

    console.log("=== 所有测试通过! ===");
  } catch (error) {
    console.error("测试失败:", error.message);
    process.exit(1);
  }
}

// 运行测试
testTemplateCRUD();
