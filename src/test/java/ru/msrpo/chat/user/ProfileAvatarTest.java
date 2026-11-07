package ru.msrpo.chat.user;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProfileAvatarTest {
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;

    @Test
    void storesScaledPhotoAndPreservesItWhenReplacementIsInvalid() throws Exception {
        var registration = mvc.perform(post("/api/v1/auth/register").contentType("application/json")
                .content(json.writeValueAsString(Map.of("username", "avatar" + UUID.randomUUID().toString().substring(0, 8),
                        "displayName", "Avatar test", "password", "Avatar-test-password-123"))))
                .andExpect(status().isCreated()).andReturn();
        var auth = json.readTree(registration.getResponse().getContentAsString());
        String bearer = "Bearer " + auth.path("accessToken").asText();
        String id = auth.path("user").path("id").asText();
        var photo = new BufferedImage(5000, 2500, BufferedImage.TYPE_3BYTE_BGR);
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(photo, "jpeg", bytes);
        var uploaded = mvc.perform(multipart(HttpMethod.PUT, "/api/v1/users/me/avatar")
                .file(new MockMultipartFile("file", "phone.jpg", "image/jpeg", bytes.toByteArray()))
                .header("Authorization", bearer)).andExpect(status().isOk()).andReturn();
        String avatarId = json.readTree(uploaded.getResponse().getContentAsString()).path("avatarId").asText();
        assertThat(avatarId).isNotEmpty();
        var downloaded = mvc.perform(get("/api/v1/users/{id}/avatar", id).header("Authorization", bearer))
                .andExpect(status().isOk()).andExpect(content().contentType("image/jpeg")).andReturn();
        var saved = ImageIO.read(new ByteArrayInputStream(downloaded.getResponse().getContentAsByteArray()));
        assertThat(saved.getWidth()).isEqualTo(1024);
        assertThat(saved.getHeight()).isEqualTo(512);
        mvc.perform(multipart(HttpMethod.PUT, "/api/v1/users/me/avatar")
                .file(new MockMultipartFile("file", "damaged.jpg", "image/jpeg", new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff}))
                .header("Authorization", bearer)).andExpect(status().isBadRequest());
        mvc.perform(multipart(HttpMethod.PUT, "/api/v1/users/me/avatar")
                .file(new MockMultipartFile("file", "large.jpg", "image/jpeg", new byte[5 * 1024 * 1024 + 1]))
                .header("Authorization", bearer)).andExpect(status().isPayloadTooLarge());
        mvc.perform(get("/api/v1/users/me").header("Authorization", bearer))
                .andExpect(status().isOk()).andExpect(jsonPath("avatarId").value(avatarId));
        mvc.perform(get("/api/v1/users/{id}/avatar", id)).andExpect(status().isUnauthorized());
    }
}
