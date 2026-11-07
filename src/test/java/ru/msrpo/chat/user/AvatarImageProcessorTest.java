package ru.msrpo.chat.user;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import ru.msrpo.chat.common.ApiException;
import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.zip.CRC32;
import static org.assertj.core.api.Assertions.*;

class AvatarImageProcessorTest {
    @Test
    void acceptsLargeRectangularPhotoAndDownscalesWithoutStretching() throws Exception {
        var photo = new BufferedImage(6000, 4000, BufferedImage.TYPE_3BYTE_BGR);
        var result = AvatarImageProcessor.process(encode(photo, "jpeg"));
        var saved = ImageIO.read(new ByteArrayInputStream(result.content()));
        assertThat(result.mimeType()).isEqualTo("image/jpeg");
        assertThat(saved.getWidth()).isEqualTo(1024);
        assertThat(saved.getHeight()).isEqualTo(683);
    }

    @Test
    void smallPngKeepsItsDimensionsAndTransparency() throws Exception {
        var photo = new BufferedImage(32, 16, BufferedImage.TYPE_INT_ARGB);
        photo.setRGB(3, 4, 0x804080c0);
        var result = AvatarImageProcessor.process(encode(photo, "png"));
        var saved = ImageIO.read(new ByteArrayInputStream(result.content()));
        assertThat(result.mimeType()).isEqualTo("image/png");
        assertThat(saved.getWidth()).isEqualTo(32);
        assertThat(saved.getHeight()).isEqualTo(16);
        assertThat(saved.getRGB(3, 4)).isEqualTo(0x804080c0);
        assertThat(saved.getRGB(0, 0) >>> 24).isZero();
    }

    @ParameterizedTest
    @CsvSource({"1,0", "2,1", "3,3", "4,2", "5,0", "6,2", "7,3", "8,1"})
    void normalizesEveryExifOrientation(int orientation, int topLeftColor) throws Exception {
        Color[] colors = { Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW };
        var source = new BufferedImage(80, 40, BufferedImage.TYPE_INT_RGB);
        var graphics = source.createGraphics();
        for (int i = 0; i < 4; i++) {
            graphics.setColor(colors[i]);
            graphics.fillRect(i % 2 * 40, i / 2 * 20, 40, 20);
        }
        graphics.dispose();
        var result = AvatarImageProcessor.process(withExif(encode(source, "jpeg"), orientation));
        var saved = ImageIO.read(new ByteArrayInputStream(result.content()));
        assertThat(saved.getWidth()).isEqualTo(orientation >= 5 ? 40 : 80);
        assertThat(saved.getHeight()).isEqualTo(orientation >= 5 ? 80 : 40);
        var actual = new Color(saved.getRGB(8, 8));
        var expected = colors[topLeftColor];
        assertThat(actual.getRed()).isCloseTo(expected.getRed(), within(35));
        assertThat(actual.getGreen()).isCloseTo(expected.getGreen(), within(35));
        assertThat(actual.getBlue()).isCloseTo(expected.getBlue(), within(35));
    }

    @Test
    void rejectsEmptyUnsupportedAndDamagedFiles() {
        assertThatThrownBy(() -> AvatarImageProcessor.process(new byte[0])).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> AvatarImageProcessor.process("not an image".getBytes())).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> AvatarImageProcessor.process(new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff})).isInstanceOf(ApiException.class);
    }

    @ParameterizedTest
    @CsvSource({"16385,1", "16384,16384"})
    void rejectsExtremeHeaderDimensionsBeforePixelDecoding(int width, int height) throws Exception {
        var bytes = encode(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), "png");
        ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN).putInt(16, width).putInt(20, height);
        var crc = new CRC32(); crc.update(bytes, 12, 17);
        ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN).putInt(29, (int) crc.getValue());
        assertThatThrownBy(() -> AvatarImageProcessor.process(bytes)).isInstanceOf(ApiException.class)
                .hasMessageContaining("слишком большое");
    }

    @Test
    void ignoresOutOfBoundsExifOffsetWithoutLosingPhoto() throws Exception {
        var bytes = withExif(encode(new BufferedImage(80, 40, BufferedImage.TYPE_INT_RGB), "jpeg"), 6);
        // TIFF first-IFD offset is relative to the TIFF header at byte 12.
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putInt(16, -1);
        var result = AvatarImageProcessor.process(bytes);
        var saved = ImageIO.read(new ByteArrayInputStream(result.content()));
        assertThat(saved.getWidth()).isEqualTo(80);
        assertThat(saved.getHeight()).isEqualTo(40);
    }

    private static byte[] encode(BufferedImage image, String format) throws Exception {
        var out = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, format, out)).isTrue();
        return out.toByteArray();
    }

    private static byte[] withExif(byte[] jpeg, int orientation) throws Exception {
        var tiff = ByteBuffer.allocate(26).order(ByteOrder.LITTLE_ENDIAN);
        tiff.put((byte) 'I').put((byte) 'I').putShort((short) 42).putInt(8).putShort((short) 1);
        tiff.putShort((short) 0x0112).putShort((short) 3).putInt(1).putShort((short) orientation).putShort((short) 0).putInt(0);
        var out = new ByteArrayOutputStream();
        out.write(jpeg, 0, 2); out.write(new byte[] {(byte) 0xff, (byte) 0xe1, 0, 34, 'E', 'x', 'i', 'f', 0, 0});
        out.write(tiff.array()); out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }
}
