import os
import json
import base64
import httpx
from typing import Optional

PALETTE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'perler_palette.json')


class NanobananaClient:
    def __init__(self, api_url: str = None, api_key: Optional[str] = None):
        self.api_url = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
        self.api_key = api_key or os.environ.get("ARK_API_KEY")

    @staticmethod
    def _build_prompt() -> str:
        """
        构建专为拼豆像素化优化的 AI 图像生成提示词。

        核心设计理念：
        - 不要试图让AI模型遵守精确的RGB颜色约束（AI生图无法做到）
        - 而是引导AI生成一张"适合被像素化"的中间图
        - 后续的像素化算法（pixel_converter）会负责精确的颜色映射

        提示词需要引导生成具备以下特征的图像：
        1. Q版/可爱（chibi/kawaii）画风，大头小身体
        2. 极少的颜色数量 (5-8种)
        3. 每个色块内颜色完全均匀，无渐变无纹理
        4. 色块边界锐利清晰
        5. 高对比度的配色
        6. 纯白背景
        7. 极简化的造型，无细碎细节
        """
        prompt = (
            "Cute chibi kawaii style illustration, super deformed 2-head-tall proportions. "
            "STRICTLY follow these rules:\n"
            "1. CHIBI ART STYLE: Big round head (占身体比例2/3), tiny stubby body, large sparkling round eyes, small dot nose, simple happy expression. Overall look must be adorable and doll-like.\n"
            "2. ROUNDED SHAPES: All forms must be soft, puffy, and rounded. No sharp angles, no realistic anatomy. Like a cute plush toy or gashapon figure.\n"
            "3. MAXIMUM 5-8 solid pure flat colors in the entire image, every region is filled with ONE uniform color, absolutely NO gradient, NO shading, NO texture, NO noise.\n"
            "4. Every color boundary must be razor-sharp and clean, like a sticker cut-out.\n"
            "5. Use thick uniform BLACK outlines (3-4px) to separate all color regions, like a coloring book.\n"
            "6. Use ONLY bright, saturated, candy-like colors (bubblegum pink, sky blue, sunny yellow, mint green, coral orange, lavender purple). Colors should feel cheerful and pop.\n"
            "7. Pure white (#FFFFFF) background, NO ground, NO shadow, NO reflection.\n"
            "8. Extremely simplified shape, remove ALL unnecessary details. No fingers, simplified hands as mittens.\n"
            "9. Centered composition, subject takes up 70-80% of the canvas.\n"
            "10. 2D flat design ONLY. No 3D, no perspective, no depth, no realistic rendering.\n"
            "The image will be converted to a Perler bead pattern, so simplicity and color clarity are critical."
        )
        return prompt

    async def generate_q_version(self, image_bytes: bytes = None, prompt: str = "") -> bytes:
        """
        调用豆包 Seedream 模型进行图像生成（支持图生图模式）。
        """
        if not self.api_key:
            self.api_key = os.environ.get("ARK_API_KEY")

        if not self.api_key:
            raise ValueError("ARK_API_KEY 未配置。请在 .env 文件中设置。")

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

        full_prompt = self._build_prompt()

        payload = {
            "model": "doubao-seedream-4-5-251128",
            "prompt": full_prompt,
            "sequential_image_generation": "disabled",
            "response_format": "b64_json",
            "size": "2K",
            "stream": False,
            "watermark": False
        }

        # 如果提供了图片，使用图生图模式
        if image_bytes:
            b64_str = base64.b64encode(image_bytes).decode('utf-8')
            data_uri = f"data:image/png;base64,{b64_str}"

            # 如果图片过大（>10MB base64），进行压缩
            try:
                import io
                from PIL import Image

                if len(b64_str) > 10 * 1024 * 1024:
                    print("图片过大，正在压缩...")
                    img = Image.open(io.BytesIO(image_bytes))
                    if img.mode != 'RGB':
                        img = img.convert('RGB')

                    max_dim = 1024
                    if max(img.size) > max_dim:
                        img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

                    output = io.BytesIO()
                    img.save(output, format='JPEG', quality=85)
                    compressed_bytes = output.getvalue()
                    b64_str = base64.b64encode(compressed_bytes).decode('utf-8')
                    data_uri = f"data:image/jpeg;base64,{b64_str}"
            except Exception as e:
                print(f"压缩图片时出错: {e}")

            payload["image"] = data_uri
            print(f"使用图生图模式 (base64 长度约: {len(b64_str)})")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.api_url,
                    json=payload,
                    headers=headers,
                    timeout=60.0
                )

                if response.status_code != 200:
                    raise Exception(f"API 请求失败: {response.text}")

                result = response.json()

                if "data" in result and len(result["data"]) > 0:
                    data_item = result["data"][0]

                    # 优先尝试 b64_json
                    b64_data = data_item.get("b64_json") or data_item.get("binary_data")
                    if b64_data:
                        return base64.b64decode(b64_data)

                    # 回退尝试 URL
                    url = data_item.get("url") or data_item.get("image_url")
                    if url:
                        async with httpx.AsyncClient() as dl_client:
                            img_response = await dl_client.get(url, timeout=60.0)
                            if img_response.status_code == 200:
                                return img_response.content
                            else:
                                raise Exception(f"下载图片失败: {img_response.status_code}")

                raise Exception("API 响应中未找到有效的图片数据")

        except Exception as e:
            print(f"调用 ARK API 出错: {e}")
            raise e

    async def check_health(self):
        return self.api_key is not None
