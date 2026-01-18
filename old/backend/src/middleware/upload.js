const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 确保上传目录存在
const uploadDir = path.join(__dirname, "../../uploads");
const previewDir = path.join(uploadDir, "previews");
const posterDir = path.join(uploadDir, "posters");

[uploadDir, previewDir, posterDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 存储配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === "preview") {
      cb(null, previewDir);
    } else if (file.fieldname === "poster") {
      cb(null, posterDir);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: function (req, file, cb) {
    // 生成唯一文件名
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  // 检查文件类型
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("只允许上传图片文件"), false);
  }
};

// 创建 multer 实例
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10, // 最多10个文件
  },
});

module.exports = upload;
