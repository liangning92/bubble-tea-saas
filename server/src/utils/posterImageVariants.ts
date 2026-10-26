import fs from 'fs';
import sharp from 'sharp';
import { localUploadPath, mediaPath } from './mediaFiles';
const dimensions = new Map<string, {
    mtime: number;
    width: number;
    height: number;
}>();
const normalize = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Only explicit product links, its primary image, or an exact product-name + orientation tag.
// Similar product names never establish a relationship and no persistent binding is changed.
export async function posterImageVariants(product: any, assets: any[] = []): Promise<{
    url: string;
    width?: number;
    height?: number;
}[]> {
    const linked = (product.images || []).map((i: any) => i.media).filter(Boolean);
    const exact = assets.filter(asset => {
        const name = String(asset.name || '').replace(/\.[a-z0-9]+$/i, '');
        const stripped = name.replace(/(?:^|[\s_-])(?:16x9|9x16|1x1|portrait|landscape|horizontal|vertical)(?=$|[\s_-])/gi, ' ');
        return stripped !== name && normalize(stripped) === normalize(product.name || '');
    });
    const urls = [...new Set<string>([product.image, ...linked.map((a: any) => a.url), ...exact.map(a => a.url)].filter(Boolean))];
    return Promise.all(urls.map(async (url) => {
        const relative = localUploadPath(url);
        if (!relative)
            return { url };
        try {
            const file = mediaPath(relative), stat = await fs.promises.stat(file), cached = dimensions.get(file);
            if (cached?.mtime === stat.mtimeMs)
                return { url, width: cached.width, height: cached.height };
            const meta = await sharp(file).metadata();
            let width = meta.width, height = meta.height;
            if (!width || !height)
                return { url };
            if (meta.orientation && meta.orientation >= 5)
                [width, height] = [height, width];
            if (dimensions.size > 2000)
                dimensions.clear();
            dimensions.set(file, { mtime: stat.mtimeMs, width, height });
            return { url, width, height };
        }
        catch {
            return { url };
        }
    }));
}
