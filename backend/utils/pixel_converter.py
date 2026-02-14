import json
import numpy as np
from PIL import Image
from typing import List, Dict, Tuple, Optional
from sklearn.cluster import KMeans
from scipy.spatial import KDTree
import os

# Load palette
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PALETTE_PATH = os.path.join(BASE_DIR, "perler_palette.json")


def load_palette() -> List[Dict]:
    with open(PALETTE_PATH, "r") as f:
        return json.load(f)


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """
    将 RGB (0-255) 转换为 CIELAB 色彩空间。
    使用 D65 白点作为参考。
    输入: shape (..., 3), dtype uint8 或 float [0,255]
    输出: shape (..., 3), dtype float64, L [0,100], a/b [-128,127]
    """
    # 归一化到 [0, 1]
    rgb_norm = rgb.astype(np.float64) / 255.0

    # sRGB gamma 校正 -> 线性 RGB
    mask = rgb_norm > 0.04045
    rgb_linear = np.where(mask, ((rgb_norm + 0.055) / 1.055) ** 2.4, rgb_norm / 12.92)

    # 线性 RGB -> XYZ (D65 白点)
    # 使用标准的 sRGB -> XYZ 转换矩阵
    r, g, b = rgb_linear[..., 0], rgb_linear[..., 1], rgb_linear[..., 2]
    x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
    y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
    z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041

    # D65 白点参考值
    xn, yn, zn = 0.95047, 1.00000, 1.08883
    x /= xn
    y /= yn
    z /= zn

    # XYZ -> Lab 的非线性函数
    epsilon = 0.008856
    kappa = 903.3

    fx = np.where(x > epsilon, np.cbrt(x), (kappa * x + 16.0) / 116.0)
    fy = np.where(y > epsilon, np.cbrt(y), (kappa * y + 16.0) / 116.0)
    fz = np.where(z > epsilon, np.cbrt(z), (kappa * z + 16.0) / 116.0)

    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b_val = 200.0 * (fy - fz)

    return np.stack([L, a, b_val], axis=-1)


def detect_background_color(image: Image.Image) -> Tuple[int, int, int]:
    """
    检测图像的背景色。
    通过采样图像四条边缘像素来确定最可能的背景色。
    """
    img_array = np.array(image)
    h, w = img_array.shape[:2]

    # 采集四条边的像素
    edge_pixels = []
    border = max(2, min(h, w) // 20)  # 边缘宽度约为图像尺寸的 5%

    # 上边
    edge_pixels.append(img_array[:border, :, :3].reshape(-1, 3))
    # 下边
    edge_pixels.append(img_array[-border:, :, :3].reshape(-1, 3))
    # 左边
    edge_pixels.append(img_array[:, :border, :3].reshape(-1, 3))
    # 右边
    edge_pixels.append(img_array[:, -border:, :3].reshape(-1, 3))

    all_edge = np.concatenate(edge_pixels, axis=0)

    # 使用中位数而非均值，对异常值更加鲁棒
    bg_color = np.median(all_edge, axis=0).astype(np.uint8)
    return tuple(bg_color.tolist())


def create_background_mask(image: Image.Image, bg_color: Tuple[int, int, int],
                           tolerance: float = 30.0) -> np.ndarray:
    """
    创建背景遮罩。在 Lab 空间中判断像素是否为背景色。
    返回 bool 数组，True == 背景像素。
    tolerance: Lab 空间中的色差阈值 (Delta E)。
    """
    img_array = np.array(image)[..., :3]  # 取 RGB 通道
    img_lab = rgb_to_lab(img_array)
    bg_lab = rgb_to_lab(np.array(bg_color, dtype=np.uint8).reshape(1, 1, 3)).reshape(3)

    # 计算每个像素与背景色的 Delta E (简单欧式距离)
    delta_e = np.sqrt(np.sum((img_lab - bg_lab) ** 2, axis=-1))

    return delta_e < tolerance


def reduce_colors_kmeans(pixels: np.ndarray, max_colors: int) -> np.ndarray:
    """
    使用 K-means 聚类将像素颜色减少到 max_colors 个代表色。
    pixels: shape (N, 3), RGB 值
    返回: shape (max_colors, 3), 聚类中心的 RGB 值
    """
    n_pixels = pixels.shape[0]
    if n_pixels == 0:
        return np.array([[255, 255, 255]])

    # 对于像素数较多的情况，随机抽样以加速 K-means
    sample_size = min(n_pixels, 10000)
    if n_pixels > sample_size:
        indices = np.random.choice(n_pixels, sample_size, replace=False)
        sample = pixels[indices]
    else:
        sample = pixels

    actual_k = min(max_colors, len(np.unique(sample, axis=0)))
    if actual_k <= 1:
        return np.mean(pixels, axis=0, keepdims=True).astype(np.uint8)

    kmeans = KMeans(n_clusters=actual_k, random_state=42, n_init=10, max_iter=100)
    kmeans.fit(sample.astype(np.float64))
    centers = kmeans.cluster_centers_.astype(np.uint8)

    return centers


def map_colors_to_palette(representative_colors: np.ndarray,
                          palette_data: List[Dict]) -> Dict[int, int]:
    """
    在 CIELAB 空间中，将每个代表色映射到最接近的拼豆调色板颜色。
    返回: {代表色索引: 调色板索引} 的映射。
    """
    palette_rgb = np.array([p["rgb"] for p in palette_data], dtype=np.uint8)
    palette_lab = rgb_to_lab(palette_rgb.reshape(-1, 1, 3)).reshape(-1, 3)

    rep_lab = rgb_to_lab(representative_colors.reshape(-1, 1, 3)).reshape(-1, 3)

    # 用 KDTree 在 Lab 空间快速查找最近邻
    tree = KDTree(palette_lab)
    _, indices = tree.query(rep_lab)

    mapping = {}
    for i, palette_idx in enumerate(indices):
        mapping[i] = int(palette_idx)

    return mapping


def process_image_to_beads(image: Image.Image, grid_size: int = 64,
                           max_colors: int = 15) -> Dict:
    """
    将 PIL Image 转换为拼豆图案。

    核心流程：
    1. 处理透明度 & 检测背景
    2. 高质量缩放 (BOX 采样)
    3. 分离背景和前景像素
    4. K-means 聚类减少前景颜色数量
    5. 在 CIELAB 色彩空间中将聚类中心映射到拼豆调色板
    6. 逐像素重新映射生成最终图案

    参数:
        image: 输入的 PIL Image 对象
        grid_size: 拼豆画的宽度格子数 (默认 64)
        max_colors: 最大使用的拼豆颜色数 (默认 15)
    """
    try:
        palette_data = load_palette()
        palette_rgb = np.array([p["rgb"] for p in palette_data], dtype=np.uint8)
        num_palette = len(palette_data)

        # ======================================================================
        # 1. 处理透明度，合成到白色背景上
        # ======================================================================
        if image.mode == 'RGBA':
            alpha = np.array(image.split()[3])
            has_transparency = np.any(alpha < 250)

            if has_transparency:
                # 合成到白色背景
                bg = Image.new('RGBA', image.size, (255, 255, 255, 255))
                bg.paste(image, mask=image.split()[3])
                image = bg.convert('RGB')
            else:
                image = image.convert('RGB')
        elif image.mode != 'RGB':
            image = image.convert('RGB')

        # ======================================================================
        # 2. 高质量缩放到目标网格大小
        # ======================================================================
        w, h = image.size
        if w <= 0 or h <= 0:
            raise ValueError(f"无效的图像尺寸: {w}x{h}")

        aspect = h / w
        target_w = grid_size
        target_h = max(1, int(grid_size * aspect))

        # 限制最大尺寸
        target_w = max(1, min(target_w, 256))
        target_h = max(1, min(target_h, 256))

        # 使用 BOX 采样 —— 这是同等于面积平均采样，在缩小图像时效果最好
        # 会将原图中每个对应区域的所有像素取平均值，避免锯齿和噪点
        img_small = image.resize((target_w, target_h), Image.Resampling.BOX)

        small_array = np.array(img_small)  # (H, W, 3)

        # ======================================================================
        # 3. 检测背景色 & 创建背景遮罩
        # ======================================================================
        bg_color = detect_background_color(img_small)
        bg_mask = create_background_mask(img_small, bg_color, tolerance=25.0)

        # 判定背景色最接近哪个拼豆颜色
        bg_rgb_arr = np.array(bg_color, dtype=np.uint8).reshape(1, 3)
        bg_to_palette = map_colors_to_palette(bg_rgb_arr, palette_data)
        bg_palette_idx = bg_to_palette[0]

        # ======================================================================
        # 4. 提取前景像素并用 K-means 减少颜色数量
        # ======================================================================
        foreground_mask = ~bg_mask
        foreground_pixels = small_array[foreground_mask]  # (N, 3)

        if foreground_pixels.shape[0] == 0:
            # 如果全是背景，整个图就填充背景色
            result_indices = np.full((target_h, target_w), bg_palette_idx, dtype=np.int32)
        else:
            # K-means 聚类得到代表色
            actual_max_colors = max(2, max_colors - 1)  # 预留 1 个给背景色
            representative_colors = reduce_colors_kmeans(foreground_pixels, actual_max_colors)

            # ======================================================================
            # 5. 在 CIELAB 空间将聚类中心映射到拼豆调色板
            # ======================================================================
            cluster_to_palette = map_colors_to_palette(representative_colors, palette_data)

            # ======================================================================
            # 6. 逐像素重新映射
            # ======================================================================
            # 先为每个像素找到最近的聚类中心
            rep_lab = rgb_to_lab(representative_colors.reshape(-1, 1, 3)).reshape(-1, 3)
            rep_tree = KDTree(rep_lab)

            img_lab = rgb_to_lab(small_array)  # (H, W, 3)
            flat_lab = img_lab.reshape(-1, 3)
            flat_bg_mask = bg_mask.reshape(-1)

            # 查询所有像素的最近聚类中心
            _, cluster_indices = rep_tree.query(flat_lab)

            # 构建最终的调色板索引数组
            result_flat = np.empty(flat_lab.shape[0], dtype=np.int32)

            for i in range(len(result_flat)):
                if flat_bg_mask[i]:
                    result_flat[i] = bg_palette_idx
                else:
                    cluster_idx = cluster_indices[i]
                    result_flat[i] = cluster_to_palette[cluster_idx]

            result_indices = result_flat.reshape(target_h, target_w)

        # ======================================================================
        # 7. 生成预览图和输出数据
        # ======================================================================
        # 用调色板颜色生成预览图
        preview_array = palette_rgb[result_indices]  # (H, W, 3)
        preview_img = Image.fromarray(preview_array.astype(np.uint8), 'RGB')

        # 放大预览图使其更清晰
        preview_scale = max(1, 512 // max(target_w, target_h))
        if preview_scale > 1:
            preview_img = preview_img.resize(
                (target_w * preview_scale, target_h * preview_scale),
                Image.Resampling.NEAREST
            )

        # 提取网格数据
        grid_ids = []
        used_indices = set()

        for row in result_indices:
            grid_row = []
            for idx in row:
                safe_idx = int(idx) if int(idx) < num_palette else 0
                grid_row.append(palette_data[safe_idx]["id"])
                used_indices.add(safe_idx)
            grid_ids.append(grid_row)

        used_palette = [palette_data[i] for i in sorted(list(used_indices))]

        return {
            "quantized_image": preview_img,
            "grid_data": grid_ids,
            "used_palette": used_palette,
            "width": target_w,
            "height": target_h
        }

    except Exception as e:
        print(f"process_image_to_beads 错误: {e}")
        import traceback
        traceback.print_exc()
        raise e
