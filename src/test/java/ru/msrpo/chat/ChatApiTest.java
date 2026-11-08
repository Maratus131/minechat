package ru.msrpo.chat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ChatApiTest {
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;

    @Test
    void presenceTracksAllDevicesAndOnlyShowsDirectPeers() throws Exception {
        var alice = register(); var bob = register(); var eve = register();
        String dialog = dialog(alice, bob);
        String presence = "/api/v1/conversations/" + dialog + "/presence";
        mvc.perform(get(presence)).andExpect(status().isUnauthorized());
        mvc.perform(get(presence).header("Authorization", bearer(eve))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/conversations/{id}/presence", UUID.randomUUID()).header("Authorization", bearer(alice)))
            .andExpect(status().isNotFound());
        mvc.perform(get(presence).header("Authorization", bearer(alice)))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("userId").value(bob.path("user").path("id").asText()))
            .andExpect(jsonPath("online").value(false));
        var first = mvc.perform(get("/api/v1/events").header("Authorization", bearer(bob)))
            .andExpect(request().asyncStarted()).andReturn();
        var second = mvc.perform(get("/api/v1/events").header("Authorization", bearer(bob)))
            .andExpect(request().asyncStarted()).andReturn();
        try {
            mvc.perform(get(presence).header("Authorization", bearer(alice))).andExpect(jsonPath("online").value(true));
            mvc.perform(get(presence).header("Authorization", bearer(bob)))
                .andExpect(jsonPath("userId").value(alice.path("user").path("id").asText()))
                .andExpect(jsonPath("online").value(false));
            first.getRequest().getAsyncContext().complete();
            mvc.perform(get(presence).header("Authorization", bearer(alice))).andExpect(jsonPath("online").value(true));
        } finally {
            first.getRequest().getAsyncContext().complete();
            second.getRequest().getAsyncContext().complete();
        }
        mvc.perform(get(presence).header("Authorization", bearer(alice))).andExpect(jsonPath("online").value(false));

        for (String kind : new String[]{"group", "channel"}) {
            String path = kind.equals("group") ? "/api/v1/groups" : "/api/v1/channels";
            String body = kind.equals("group") ? "{\"title\":\"Группа\",\"memberIds\":[]}"
                : "{\"username\":\"c" + UUID.randomUUID().toString().replace("-", "").substring(0, 16) + "\",\"title\":\"Канал\"}";
            var result = mvc.perform(post(path).header("Authorization", bearer(alice)).contentType("application/json").content(body))
                .andExpect(status().isCreated()).andReturn();
            String id = json.readTree(result.getResponse().getContentAsString()).path("id").asText();
            mvc.perform(get("/api/v1/conversations/{id}/presence", id).header("Authorization", bearer(alice)))
                .andExpect(status().isNotFound());
        }
    }

    @Test
    void eventsReachOnlyParticipantsAfterCommitAndFailedUploadsLeaveNoMessage() throws Exception {
        var alice = register(); var bob = register(); var eve = register();
        String dialog = dialog(alice, bob);
        var bobStream = mvc.perform(get("/api/v1/events").header("Authorization", bearer(bob)))
            .andExpect(request().asyncStarted()).andReturn();
        var eveStream = mvc.perform(get("/api/v1/events").header("Authorization", bearer(eve)))
            .andExpect(request().asyncStarted()).andReturn();
        try {
            mvc.perform(multipart("/api/v1/conversations/{id}/messages", dialog)
                    .file(new MockMultipartFile("files", "valid.txt", "text/plain", "hello".getBytes()))
                    .file(new MockMultipartFile("files", "empty.txt", "text/plain", new byte[0]))
                    .header("Authorization", bearer(alice))).andExpect(status().isBadRequest());
            assertThat(bobStream.getResponse().getContentAsString()).doesNotContain("message.created");
            mvc.perform(get("/api/v1/conversations/{id}/messages", dialog).header("Authorization", bearer(alice)))
                .andExpect(jsonPath("items").isEmpty());
            send(alice, dialog, "hello-realtime");
            assertThat(bobStream.getResponse().getContentAsString()).contains("message.created", "hello-realtime");
            assertThat(eveStream.getResponse().getContentAsString()).doesNotContain("message.created", "hello-realtime");
        } finally {
            bobStream.getRequest().getAsyncContext().complete();
            eveStream.getRequest().getAsyncContext().complete();
        }
    }

    @Test
    void validatesFileLimitsAndUserSearchAndDocumentsApi() throws Exception {
        var alice = register(); var bob = register(); String dialog = dialog(alice, bob);
        mvc.perform(multipart("/api/v1/conversations/{id}/messages", dialog)
                .file(new MockMultipartFile("files", "large.bin", "application/octet-stream", new byte[10 * 1024 * 1024 + 1]))
                .header("Authorization", bearer(alice))).andExpect(status().isContentTooLarge());
        var request = multipart("/api/v1/conversations/{id}/messages", dialog).header("Authorization", bearer(alice));
        for (int i = 0; i < 6; i++) request.file(new MockMultipartFile("files", "a.txt", "text/plain", new byte[]{1}));
        mvc.perform(request).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/users").param("q", bob.path("user").path("username").asText())
                .header("Authorization", bearer(alice)))
            .andExpect(status().isOk()).andExpect(jsonPath("items[0].id").value(bob.path("user").path("id").asText()));
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andExpect(jsonPath("paths").isNotEmpty());
    }

    @Test
    void registerLoginAndRejectDuplicateOrBadCredentials() throws Exception {
        String username = "u" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        var account = register(username);
        mvc.perform(post("/api/v1/auth/login").contentType("application/json")
                .content("{\"username\":\"" + username + "\",\"password\":\"Password123!\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("accessToken").isNotEmpty());
        mvc.perform(post("/api/v1/auth/register").contentType("application/json")
                .content(registration(username.toUpperCase())))
            .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/auth/login").contentType("application/json")
                .content("{\"username\":\"" + username + "\",\"password\":\"incorrect\"}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/users/me").header("Authorization", bearer(account)))
            .andExpect(status().isOk()).andExpect(jsonPath("passwordHash").doesNotExist())
            .andExpect(jsonPath("username").value(username));
    }

    @Test
    void rejectsAnonymousInvalidTokenAndInvalidRegistration() throws Exception {
        mvc.perform(get("/api/v1/conversations")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/login").header("Authorization", "Bearer broken")
                .contentType("application/json").content("{}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/register").contentType("application/json")
                .content("{\"username\":\"x\",\"displayName\":\"\",\"password\":\"123\"}"))
            .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }

    @Test
    void oneDialogPerPairAndOnlyMembersCanReadWriteOrSearch() throws Exception {
        var alice = register(); var bob = register(); var eve = register();
        String dialog = dialog(alice, bob);
        assertThat(dialog(bob, alice)).isEqualTo(dialog);
        send(alice, dialog, "Привет!");
        mvc.perform(get("/api/v1/conversations").header("Authorization", bearer(bob)))
            .andExpect(status().isOk()).andExpect(jsonPath("items[0].id").value(dialog))
            .andExpect(jsonPath("items[0].lastMessageText").value("Привет!"));
        mvc.perform(get("/api/v1/conversations/{id}/messages", dialog).header("Authorization", bearer(bob)))
            .andExpect(status().isOk()).andExpect(jsonPath("items[0].text").value("Привет!"));
        mvc.perform(get("/api/v1/conversations/{id}/messages", dialog).header("Authorization", bearer(eve)))
            .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/conversations/{id}/messages", dialog).header("Authorization", bearer(eve))
                .contentType("application/json").content("{\"text\":\"Взлом\"}"))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/conversations/{id}/messages/search", dialog).param("q", "Привет")
                .header("Authorization", bearer(eve))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/conversations").header("Authorization", bearer(eve)))
            .andExpect(jsonPath("items").isEmpty());
    }

    @Test
    void attachmentsAreAtomicPrivateAndDownloadedAsFiles() throws Exception {
        var alice = register(); var bob = register(); var eve = register();
        String dialog = dialog(alice, bob);
        var result = mvc.perform(multipart("/api/v1/conversations/{id}/messages", dialog)
                .file(new MockMultipartFile("files", "../report.html", "text/html", "<script>alert(1)</script>".getBytes()))
                .header("Authorization", bearer(alice)))
            .andExpect(status().isCreated()).andExpect(jsonPath("attachments[0].filename").value("report.html"))
            .andReturn();
        String attachment = json.readTree(result.getResponse().getContentAsString()).path("attachments").get(0).path("id").asText();
        mvc.perform(get("/api/v1/attachments/{id}", attachment).header("Authorization", bearer(bob)))
            .andExpect(status().isOk()).andExpect(content().contentType("application/octet-stream"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment;")))
            .andExpect(content().string("<script>alert(1)</script>"));
        mvc.perform(get("/api/v1/attachments/{id}", attachment).header("Authorization", bearer(eve)))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/attachments/{id}", attachment)).andExpect(status().isUnauthorized());
    }

    @Test
    void validatesEmptyMessagesFilesAndCursorAndPaginatesWithoutDuplicates() throws Exception {
        var alice = register(); String dialog = dialog(alice, register());
        mvc.perform(post("/api/v1/conversations/{id}/messages", dialog).header("Authorization", bearer(alice))
                .contentType("application/json").content("{\"text\":\"  \"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/v1/conversations/{id}/messages", dialog)
                .file(new MockMultipartFile("files", "empty.txt", "text/plain", new byte[0]))
                .header("Authorization", bearer(alice))).andExpect(status().isBadRequest());
        long first = send(alice, dialog, "Первое").path("id").asLong();
        long second = send(alice, dialog, "Второе").path("id").asLong();
        mvc.perform(get("/api/v1/conversations/{id}/messages", dialog).param("limit", "1")
                .header("Authorization", bearer(alice)))
            .andExpect(jsonPath("items[0].id").value(second)).andExpect(jsonPath("hasMore").value(true));
        mvc.perform(get("/api/v1/conversations/{id}/messages", dialog).param("beforeId", "" + second)
                .header("Authorization", bearer(alice)))
            .andExpect(jsonPath("items[0].id").value(first)).andExpect(jsonPath("items.length()").value(1));
        mvc.perform(get("/api/v1/conversations/{id}/messages", dialog).param("afterId", "" + first)
                .header("Authorization", bearer(alice))).andExpect(jsonPath("items[0].id").value(second));
        mvc.perform(get("/api/v1/conversations/{id}/messages", dialog).param("limit", "10000")
                .header("Authorization", bearer(alice))).andExpect(status().isBadRequest());
    }

    @Test
    void cannotOpenDialogWithSelf() throws Exception {
        var alice = register();
        mvc.perform(post("/api/v1/conversations").header("Authorization", bearer(alice))
                .contentType("application/json").content("{\"userId\":\"" + alice.path("user").path("id").asText() + "\"}"))
            .andExpect(status().isBadRequest());
    }

    JsonNode register() throws Exception { return register("u" + UUID.randomUUID().toString().replace("-", "").substring(0, 16)); }
    JsonNode register(String username) throws Exception {
        var response = mvc.perform(post("/api/v1/auth/register").contentType("application/json").content(registration(username)))
            .andExpect(status().isCreated()).andReturn();
        return json.readTree(response.getResponse().getContentAsString());
    }
    String registration(String username) {
        return "{\"username\":\"" + username + "\",\"displayName\":\"Тест\",\"password\":\"Password123!\"}";
    }
    String bearer(JsonNode account) { return "Bearer " + account.path("accessToken").asText(); }
    String dialog(JsonNode from, JsonNode to) throws Exception {
        var response = mvc.perform(post("/api/v1/conversations").header("Authorization", bearer(from))
                .contentType("application/json").content("{\"userId\":\"" + to.path("user").path("id").asText() + "\"}"))
            .andExpect(status().isOk()).andReturn();
        return json.readTree(response.getResponse().getContentAsString()).path("id").asText();
    }
    JsonNode send(JsonNode from, String dialog, String text) throws Exception {
        var response = mvc.perform(post("/api/v1/conversations/{id}/messages", dialog).header("Authorization", bearer(from))
                .contentType("application/json").content(json.writeValueAsString(java.util.Map.of("text", text))))
            .andExpect(status().isCreated()).andReturn();
        return json.readTree(response.getResponse().getContentAsString());
    }
}
