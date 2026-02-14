# Img2Pindou 🫘

将任意图片转换为拼豆（Perler Beads）底稿的 Web 应用。

支持 AI 图像风格化 + 智能像素化，生成色彩鲜明、颜色数量可控的拼豆图纸。

## ✨ 功能特性

- **AI 图像风格化**：调用豆包 Seedream 模型，将照片转为扁平矢量图标风格，适合像素化
- **智能像素化引擎**：
  - CIELAB 色彩空间精确匹配 92 种实体拼豆颜色
  - K-means 聚类预减色，控制最终使用的颜色数量（5-30 种可调）
  - BOX 面积采样缩放，避免锯齿噪点
  - 智能背景检测与分离
- **图片裁剪**：内置裁剪工具，精准选择目标区域
- **实时调节**：网格密度（16-128）、颜色数量（5-30）实时可调
- **拼豆色卡**：显示实际使用的拼豆颜色名称和编号，方便购买对应色号

## 🏗️ 技术架构

```
img2pindou/
├── backend/          # Python FastAPI 后端
│   ├── main.py               # API 路由
│   ├── perler_palette.json    # 92 色拼豆调色板
│   └── utils/
│       ├── nanobanana_client.py   # 豆包 AI 图像生成
│       └── pixel_converter.py     # 像素化核心算法
├── frontend/         # React + TypeScript + Tailwind 前端
│   └── src/
│       ├── App.tsx
│       └── components/
└── docker-compose.yml
```

## 🚀 快速上手

### 前置条件

- Docker & Docker Compose
- 豆包 (Doubao) API Key（[获取地址](https://console.volcengine.com/ark/)）

### 1. 克隆项目

```bash
git clone https://github.com/leecyang/img2pindou.git
cd img2pindou
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入你的 API Key
```

### 3. 启动服务

```bash
docker-compose up --build
```

启动后访问：
- **前端界面**：http://localhost:6611
- **后端 API**：http://localhost:6610

### 本地开发（不使用 Docker）

**后端：**

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**前端：**

```bash
cd frontend
pnpm install
pnpm dev
```

## 📖 使用流程

1. **上传图片** → 选择一张想要制作拼豆的图片
2. **AI 生成**（可选）→ 将图片转为扁平矢量风格，减少细节，让像素化效果更好
3. **像素化** → 调节网格密度和颜色数量，生成拼豆底稿
4. **拼装参考** → 查看使用的颜色列表，按色号购买拼豆

## 📄 License

MIT
