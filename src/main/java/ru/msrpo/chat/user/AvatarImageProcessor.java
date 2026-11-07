package ru.msrpo.chat.user;

import ru.msrpo.chat.common.ApiException;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import java.awt.AlphaComposite;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

final class AvatarImageProcessor {
    private static final int MAX_SIDE = 1024;
    private static final int MAX_SOURCE_SIDE = 16384;
    private static final long MAX_SOURCE_PIXELS = 200_000_000L;
    record Image(String mimeType, byte[] content) {}

    private AvatarImageProcessor() {}

    static Image process(byte[] content) {
        String format = format(content);
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(content))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw ApiException.badRequest("Изображение повреждено");
            var reader = readers.next();
            try {
                reader.setInput(input, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > MAX_SOURCE_SIDE || height > MAX_SOURCE_SIDE
                        || (long) width * height > MAX_SOURCE_PIXELS)
                    throw ApiException.badRequest("Фото слишком большое для обработки. Выберите изображение меньшего разрешения.");
                var options = reader.getDefaultReadParam();
                int sample = Math.max(1, Math.max(width, height) / MAX_SIDE);
                options.setSourceSubsampling(sample, sample, 0, 0);
                var source = reader.read(0, options);
                if (source == null) throw ApiException.badRequest("Изображение повреждено");
                double scale = Math.min(1.0, (double) MAX_SIDE / Math.max(source.getWidth(), source.getHeight()));
                int targetWidth = Math.max(1, (int) Math.round(source.getWidth() * scale));
                int targetHeight = Math.max(1, (int) Math.round(source.getHeight() * scale));
                int type = format.equals("png") ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
                var resized = new BufferedImage(targetWidth, targetHeight, type);
                var graphics = resized.createGraphics();
                try {
                    graphics.setComposite(AlphaComposite.Src);
                    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    graphics.drawImage(source, 0, 0, targetWidth, targetHeight, null);
                } finally { graphics.dispose(); }
                var image = orient(resized, format.equals("jpeg") ? orientation(content) : 1);
                var output = new ByteArrayOutputStream();
                if (!ImageIO.write(image, format, output)) throw ApiException.badRequest("Не удалось обработать изображение");
                return new Image("image/" + format, output.toByteArray());
            } finally { reader.dispose(); }
        } catch (IOException | RuntimeException error) {
            if (error instanceof ApiException api) throw api;
            throw ApiException.badRequest("Изображение повреждено");
        }
    }

    private static String format(byte[] content) {
        if (content.length >= 8 && content[0] == (byte) 0x89 && content[1] == 'P' && content[2] == 'N'
                && content[3] == 'G' && content[4] == 13 && content[5] == 10 && content[6] == 26 && content[7] == 10)
            return "png";
        if (content.length >= 3 && content[0] == (byte) 0xff && content[1] == (byte) 0xd8 && content[2] == (byte) 0xff)
            return "jpeg";
        throw ApiException.badRequest("Используйте изображение JPEG или PNG");
    }

    private static BufferedImage orient(BufferedImage source, int orientation) {
        int width = source.getWidth(), height = source.getHeight();
        if (orientation == 1) return source;
        var transform = switch (orientation) {
            case 2 -> new AffineTransform(-1, 0, 0, 1, width, 0);
            case 3 -> new AffineTransform(-1, 0, 0, -1, width, height);
            case 4 -> new AffineTransform(1, 0, 0, -1, 0, height);
            case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
            case 6 -> new AffineTransform(0, 1, -1, 0, height, 0);
            case 7 -> new AffineTransform(0, -1, -1, 0, height, width);
            case 8 -> new AffineTransform(0, -1, 1, 0, 0, width);
            default -> new AffineTransform();
        };
        boolean swap = orientation >= 5;
        var result = new BufferedImage(swap ? height : width, swap ? width : height, source.getType());
        var graphics = result.createGraphics();
        try { graphics.drawImage(source, transform, null); } finally { graphics.dispose(); }
        return result;
    }

    // Read only the bounded EXIF orientation field; never follow arbitrary metadata offsets.
    private static int orientation(byte[] jpeg) {
        int offset = 2;
        while (offset + 4 <= jpeg.length && (jpeg[offset] & 255) == 255) {
            int marker = jpeg[offset + 1] & 255;
            if (marker == 0xda || marker == 0xd9) break;
            if (marker == 0xff) { offset++; continue; }
            if (marker == 0x01 || marker >= 0xd0 && marker <= 0xd7) { offset += 2; continue; }
            int length = (jpeg[offset + 2] & 255) * 256 + (jpeg[offset + 3] & 255);
            if (length < 2 || offset + 2L + length > jpeg.length) break;
            int start = offset + 4, end = offset + 2 + length;
            if (marker == 0xe1 && end - start >= 14 && jpeg[start] == 'E' && jpeg[start + 1] == 'x'
                    && jpeg[start + 2] == 'i' && jpeg[start + 3] == 'f' && jpeg[start + 4] == 0 && jpeg[start + 5] == 0) {
                int tiff = start + 6;
                boolean little = jpeg[tiff] == 'I' && jpeg[tiff + 1] == 'I';
                if (!little && !(jpeg[tiff] == 'M' && jpeg[tiff + 1] == 'M')) return 1;
                if (number(jpeg, tiff + 2, 2, little) != 42) return 1;
                long directory = tiff + number(jpeg, tiff + 4, 4, little);
                if (directory < tiff + 8 || directory + 2 > end) return 1;
                int count = (int) number(jpeg, (int) directory, 2, little);
                for (int i = 0; i < count; i++) {
                    long entry = directory + 2L + i * 12L;
                    if (entry + 12 > end) return 1;
                    int position = (int) entry;
                    if (number(jpeg, position, 2, little) == 0x0112
                            && number(jpeg, position + 2, 2, little) == 3
                            && number(jpeg, position + 4, 4, little) == 1) {
                        int value = (int) number(jpeg, position + 8, 2, little);
                        return value >= 1 && value <= 8 ? value : 1;
                    }
                }
            }
            offset = end;
        }
        return 1;
    }

    private static long number(byte[] data, int offset, int count, boolean little) {
        long result = 0;
        for (int i = 0; i < count; i++) result = (result << 8) | (data[offset + (little ? count - i - 1 : i)] & 255);
        return result;
    }
}
