from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import io
import base64
from PIL import Image

from utils.pixel_converter import process_image_to_beads
from utils.nanobanana_client import NanobananaClient

import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# 允许前端跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制为具体前端域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/generate")
async def generate_image(
    file: Optional[UploadFile] = File(None),
    api_url: Optional[str] = Form(None)
):
    """
    使用豆包 Seedream 模型生成适合拼豆像素化的图像
    """
    try:
        client = NanobananaClient()

        contents = None
        if file:
            contents = await file.read()

        logger.info("收到图片生成请求")

        generated_bytes = await client.generate_q_version(contents)

        b64_img = base64.b64encode(generated_bytes).decode('utf-8')
        return JSONResponse(content={"image": f"data:image/png;base64,{b64_img}"})

    except Exception as e:
        logger.error(f"/generate 接口错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pixelate")
async def pixelate_image(
    file: UploadFile = File(...),
    grid_size: int = Form(64),
    max_colors: int = Form(15)
):
    """
    将上传的图像转换为拼豆像素图案。

    参数:
        file: 图像文件
        grid_size: 网格宽度（像素/格子数）
        max_colors: 最大使用的拼豆颜色数量（默认15）
    """
    try:
        contents = await file.read()
        logger.info(
            f"收到像素化请求。文件大小: {len(contents)} 字节。"
            f"网格: {grid_size}。最大颜色数: {max_colors}"
        )

        if len(contents) == 0:
            raise ValueError("接收到空文件")

        image = Image.open(io.BytesIO(contents)).convert("RGB")

        result = process_image_to_beads(image, grid_size=grid_size, max_colors=max_colors)

        # 将预览图转为 base64
        buffered = io.BytesIO()
        result["quantized_image"].save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

        return JSONResponse(content={
            "preview": f"data:image/png;base64,{img_str}",
            "grid_data": result["grid_data"],        # 二维调色板 ID 数组
            "used_palette": result["used_palette"],   # 实际使用的颜色列表
            "width": result["width"],
            "height": result["height"]
        })

    except Exception as e:
        logger.error(f"/pixelate 接口错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
