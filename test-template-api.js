const http = require("http");

// 测试数据
const templateData = JSON.stringify({
  name: "测试模板",
  description: "这是一个测试模板",
  canvasData: {
    width: 800,
    height: 600,
    background: "#ffffff",
    elements: [],
  },
  tags: ["测试", "电影"],
});

// POST 请求选项
const options = {
  hostname: "localhost",
  port: 3001,
  path: "/api/templates",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(templateData),
  },
};

// 发送 POST 请求
console.log("正在创建模板...");
const req = http.request(options, (res) => {
  let data = "";

  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("状态码:", res.statusCode);
    console.log("响应:", JSON.parse(data));

    // 创建成功后,获取模板列表
    if (res.statusCode === 201 || res.statusCode === 200) {
      console.log("\n正在获取模板列表...");
      http.get("http://localhost:3001/api/templates", (getRes) => {
        let listData = "";

        getRes.on("data", (chunk) => {
          listData += chunk;
        });

        getRes.on("end", () => {
          console.log("模板列表:", JSON.parse(listData));
        });
      });
    }
  });
});

req.on("error", (e) => {
  console.error("请求失败:", e.message);
});

// 写入数据到请求体
req.write(templateData);
req.end();
