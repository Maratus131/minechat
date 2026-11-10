package ru.msrpo.chat.notification;

import nl.martijndwars.webpush.Utils;
import org.bouncycastle.jce.ECNamedCurveTable;
import org.bouncycastle.jce.interfaces.ECPublicKey;
import org.bouncycastle.jce.interfaces.ECPrivateKey;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import java.security.*;
import java.util.Base64;

final class PushTestKeys {
    static PushProperties generate() {
        try {
            if (Security.getProvider("BC") == null) Security.addProvider(new BouncyCastleProvider());
            var generator = KeyPairGenerator.getInstance("ECDH", "BC");
            generator.initialize(ECNamedCurveTable.getParameterSpec("prime256v1"));
            var pair = generator.generateKeyPair(); var base64 = Base64.getUrlEncoder().withoutPadding();
            return new PushProperties(base64.encodeToString(Utils.encode((ECPublicKey) pair.getPublic())),
                base64.encodeToString(Utils.encode((ECPrivateKey) pair.getPrivate())), "https://example.test");
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
}
