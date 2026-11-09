package ru.msrpo.chat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.UUID;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ChatApiTest {
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate database;

    @Test
    void editsOnlyOwnMessagesWithoutTimeLimitAndKeepsActivityAndLatestPreview() throws Exception {
        var alice = register(); var bob = register(); var eve = register();
        String conversation = dialog(alice, bob);
        var first = send(alice, conversation, "first");
        var latest = send(bob, conversation, "latest");
        long firstId = first.path("id").asLong(); long latestId = latest.path("id").asLong();
        String path = "/api/v1/conversations/" + conversation + "/messages/" + firstId;
        database.update("update messages set created_at = ? where id = ?", java.sql.Timestamp.from(java.time.Instant.parse("2000-01-01T00:00:00Z")), firstId);
        mvc.perform(put(path).contentType("application/json").content("{\"text\":\"changed\"}")).andExpect(status().isUnauthorized());
        mvc.perform(put(path).header("Authorization", bearer(eve)).contentType("application/json").content("{\"text\":\"changed\"}"))
            .andExpect(status().isNotFound());
        mvc.perform(put(path).header("Authorization", bearer(bob)).contentType("application/json").content("{\"text\":\"changed\"}"))
            .andExpect(status().isForbidden());
        var changed = edit(alice, conversation, firstId, "changed years later");
        assertThat(changed.path("text").asText()).isEqualTo("changed years later");
        assertThat(changed.path("createdAt").asText()).isEqualTo("2000-01-01T00:00:00Z");
        assertThat(changed.path("editedAt").isTextual()).isTrue();
        var before = mvc.perform(get("/api/v1/conversations").header("Authorization", bearer(alice)))
            .andExpect(jsonPath("items[0].lastMessageText").value("latest")).andReturn();
        String activity = json.readTree(before.getResponse().getContentAsString()).path("items").get(0).path("lastActivityAt").asText();
        edit(bob, conversation, latestId, "new preview");
        mvc.perform(get("/api/v1/conversations").header("Authorization", bearer(alice)))
            .andExpect(jsonPath("items[0].lastMessageText").value("new preview"))
            .andExpect(jsonPath("items[0].lastActivityAt").value(activity));
        mvc.perform(put("/api/v1/conversations/{id}/messages/{message}", UUID.randomUUID(), firstId)
                .header("Authorization", bearer(alice)).contentType("application/json").content("{\"text\":\"x\"}"))
            .andExpect(status().isNotFound());
        mvc.perform(put("/api/v1/conversations/{id}/messages/{message}", conversation, Long.MAX_VALUE)
                .header("Authorization", bearer(alice)).contentType("application/json").content("{\"text\":\"x\"}"))
            .andExpect(status().isNotFound());
    }

    @Test
    void editsCaptionsWithoutReplacingFilesAndValidatesEmptyNullDeletedAndLongText() throws Exception {
        var alice = register(); var bob = register(); String conversation = dialog(alice, bob);
        var result = mvc.perform(multipart("/api/v1/conversations/{id}/messages", conversation)
                .file(new MockMultipartFile("files", "keep.txt", "text/plain", "unchanged bytes".getBytes()))
                .param("text", "old caption").header("Authorization", bearer(alice)))
            .andExpect(status().isCreated()).andReturn();
        var original = json.readTree(result.getResponse().getContentAsString());
        long id = original.path("id").asLong();
        var updated = edit(alice, conversation, id, "new caption");
        assertThat(updated.path("attachments")).isEqualTo(original.path("attachments"));
        mvc.perform(get("/api/v1/attachments/{id}", original.path("attachments").get(0).path("id").asText())
                .header("Authorization", bearer(bob)))
            .andExpect(status().isOk()).andExpect(content().bytes("unchanged bytes".getBytes()));
        assertThat(edit(alice, conversation, id, "   ").path("text").asText()).isEmpty();
        long textOnly = send(alice, conversation, "nonempty").path("id").asLong();
        String path = "/api/v1/conversations/" + conversation + "/messages/" + textOnly;
        for (String body : List.of("{}", "{\"text\":null}", "{\"text\":\" \"}", json.writeValueAsString(java.util.Map.of("text", "x".repeat(4097))),
                json.writeValueAsString(java.util.Map.of("text", "bad\0text")))) {
            mvc.perform(put(path).header("Authorization", bearer(alice)).contentType("application/json").content(body))
                .andExpect(status().isBadRequest());
        }
        mvc.perform(delete(path).header("Authorization", bearer(alice))).andExpect(status().isOk());
        mvc.perform(put(path).header("Authorization", bearer(alice)).contentType("application/json").content("{\"text\":\"restore\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void groupAndChannelEditingNeedsOwnAuthorshipAndCurrentPublishPermission() throws Exception {
        var owner = register(); var member = register(); var admin = register();
        String memberId = member.path("user").path("id").asText(); String adminId = admin.path("user").path("id").asText();
        var groupResult = mvc.perform(post("/api/v1/groups").header("Authorization", bearer(owner)).contentType("application/json")
                .content(json.writeValueAsString(java.util.Map.of("title", "Edit group", "memberIds", List.of(memberId, adminId)))))
            .andExpect(status().isCreated()).andReturn();
        String group = json.readTree(groupResult.getResponse().getContentAsString()).path("id").asText();
        long memberMessage = send(member, group, "member text").path("id").asLong();
        edit(member, group, memberMessage, "member edited");
        mvc.perform(put("/api/v1/conversations/{id}/messages/{message}", group, memberMessage)
                .header("Authorization", bearer(owner)).contentType("application/json").content("{\"text\":\"owner change\"}"))
            .andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/groups/{id}/members/{user}", group, adminId).header("Authorization", bearer(owner))
                .contentType("application/json").content("{\"role\":\"ADMIN\"}")).andExpect(status().isOk());
        mvc.perform(put("/api/v1/conversations/{id}/messages/{message}", group, memberMessage)
                .header("Authorization", bearer(admin)).contentType("application/json").content("{\"text\":\"admin change\"}"))
            .andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/groups/{id}/members/{user}", group, memberId).header("Authorization", bearer(owner))
                .contentType("application/json").content("{\"role\":\"READER\"}")).andExpect(status().isOk());
        mvc.perform(put("/api/v1/conversations/{id}/messages/{message}", group, memberMessage)
                .header("Authorization", bearer(member)).contentType("application/json").content("{\"text\":\"reader change\"}"))
            .andExpect(status().isForbidden());
        var channelResult = mvc.perform(post("/api/v1/channels").header("Authorization", bearer(owner)).contentType("application/json")
                .content(json.writeValueAsString(java.util.Map.of("title", "Edit channel", "username", "c" + UUID.randomUUID().toString().replace("-", "").substring(0, 16)))))
            .andExpect(status().isCreated()).andReturn();
        String channel = json.readTree(channelResult.getResponse().getContentAsString()).path("id").asText();
        mvc.perform(post("/api/v1/channels/{id}/subscription", channel).header("Authorization", bearer(member))).andExpect(status().isOk());
        mvc.perform(put("/api/v1/channels/{id}/members/{user}", channel, memberId).header("Authorization", bearer(owner))
                .contentType("application/json").content("{\"role\":\"ADMIN\"}")).andExpect(status().isOk());
        long publication = send(member, channel, "publication").path("id").asLong();
        edit(member, channel, publication, "updated publication");
        mvc.perform(put("/api/v1/conversations/{id}/messages/{message}", channel, publication)
                .header("Authorization", bearer(owner)).contentType("application/json").content("{\"text\":\"owner change\"}"))
            .andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/channels/{id}/members/{user}", channel, memberId).header("Authorization", bearer(owner))
                .contentType("application/json").content("{\"role\":\"SUBSCRIBER\"}")).andExpect(status().isOk());
        mvc.perform(put("/api/v1/conversations/{id}/messages/{message}", channel, publication)
                .header("Authorization", bearer(member)).contentType("application/json").content("{\"text\":\"subscriber change\"}"))
            .andExpect(status().isForbidden());
    }

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
            var message = send(alice, dialog, "hello-realtime");
            assertThat(bobStream.getResponse().getContentAsString()).contains("message.created", "hello-realtime");
            assertThat(eveStream.getResponse().getContentAsString()).doesNotContain("message.created", "hello-realtime");
            edit(alice, dialog, message.path("id").asLong(), "updated-realtime");
            assertThat(bobStream.getResponse().getContentAsString()).contains("message.updated", "updated-realtime");
            assertThat(eveStream.getResponse().getContentAsString()).doesNotContain("message.updated", "updated-realtime");
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
    JsonNode edit(JsonNode from, String dialog, long id, String text) throws Exception {
        var response = mvc.perform(put("/api/v1/conversations/{id}/messages/{message}", dialog, id).header("Authorization", bearer(from))
                .contentType("application/json").content(json.writeValueAsString(java.util.Map.of("text", text))))
            .andExpect(status().isOk()).andReturn();
        return json.readTree(response.getResponse().getContentAsString());
    }
}
