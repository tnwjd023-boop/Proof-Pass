// Integration fixture using real issuer and holder SDK cryptography.
// Synthetic identity and ephemeral private values remain in memory only.
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import java.io.OutputStream;
import java.io.PrintStream;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.Instant;
import java.security.MessageDigest;
import java.util.*;
import org.omnione.did.zkp.core.manager.*;
import org.omnione.did.zkp.crypto.generator.ZkpKeyPairGenerator;
import org.omnione.did.zkp.crypto.util.SignatureUtils;
import org.omnione.did.zkp.crypto.util.BigIntegerUtil;
import org.omnione.did.zkp.datamodel.credential.*;
import org.omnione.did.zkp.datamodel.credentialrequest.CredentialRequest;
import org.omnione.did.zkp.datamodel.proof.Proof;
import org.omnione.did.zkp.datamodel.proof.verifyparam.ProofVerifyParam;
import org.omnione.did.zkp.datamodel.proofrequest.ProofRequest;
import org.omnione.did.sdk.core.zkp.other.helper.CredentialRequestHelper;
import org.omnione.did.sdk.core.zkp.other.helper.CredentialValueHelper;
import org.omnione.did.sdk.core.zkp.other.util.ProofBuilder;
import org.omnione.did.sdk.datamodel.zkp.MasterSecret;
import org.omnione.did.sdk.datamodel.zkp.CredentialVerifier;
import org.omnione.did.sdk.datamodel.zkp.NonCredentialSchema;
import org.omnione.did.sdk.datamodel.zkp.RequestedProof;
import org.omnione.did.sdk.datamodel.zkp.Identifiers;

public class OpenDidRoundTrip {
    static final Gson G = new GsonBuilder().create();
    static final Map<String, Object> RESULTS = new LinkedHashMap<>();
    static BigInteger bindingNonce;
    static Path bindingExport;
    static String bindingPolicy;
    static <T> T bridge(Object value, Class<T> type) { return G.fromJson(G.toJson(value), type); }
    static void require(boolean condition, String label) { if (!condition) throw new AssertionError(label); }
    interface Checked { boolean run() throws Exception; }
    static void rejected(String name, Checked check) throws Exception {
        boolean accepted;
        try { accepted = check.run(); }
        catch (org.omnione.did.zkp.exception.ZkpException expected) { accepted = false; }
        require(!accepted, name + " unexpectedly accepted");
        RESULTS.put(name, "rejected");
    }

    static void roundTrip() throws Exception {
        long started = System.nanoTime();
        var random = new BigIntegerUtil();
        var metadata = new ZkpCredentialMetadataManager();
        var keys = new ZkpKeyPairGenerator().generateKeyPair(new ArrayList<>(List.of("birthdate")));
        var schema = metadata.createSchema("did:omn:proofpass-test-issuer", "age", "1.0", List.of("birthdate"), List.of(), "gate0");
        var definition = metadata.createDefinition("did:omn:proofpass-test-issuer", schema, keys.getPublicKey());
        var offerNonce = random.generateNonce();
        var proverNonce = random.generateNonce();
        var offer = new ZkpCredentialManager().createCredentialOffer(SignatureUtils.generateKeyProof(keys), schema.getId(), definition.getId(), offerNonce);
        var publicKey = bridge(keys.getPublicKey(), org.omnione.did.sdk.datamodel.zkp.CredentialPrimaryPublicKey.class);
        var holderOffer = bridge(offer, org.omnione.did.sdk.datamodel.zkp.CredentialOffer.class);
        var master = new MasterSecret("ephemeral", random.createRandomBigInteger(256));
        var vPrime = new org.omnione.did.sdk.core.zkp.other.util.BigIntegerUtil().createRandomBigInteger(
            org.omnione.did.sdk.core.zkp.other.util.ZkpConstants.LARGE_VPRIME);
        var holderRequest = CredentialRequestHelper.generateCredentialRequest(publicKey, "did:omn:proofpass-test-holder", master, holderOffer, proverNonce, vPrime);
        var request = bridge(holderRequest, CredentialRequest.class);
        require(new SignatureUtils().verifyCredentialRequest(keys.getPublicKey(), request.getBlindedMs(), request.getBlindedMsProof(), offerNonce), "credential request");

        var values = new LinkedHashMap<String, AttributeValue>();
        var birth = new AttributeValue();
        birth.setRaw("19900101");
        values.put("birthdate", birth);
        var credentialValues = new CredentialValues();
        credentialValues.setValues(values);
        var signature = new CredentialSignature();
        signature.setPrimaryCredential(SignatureUtils.generateSignature("did:omn:proofpass-test-holder", keys, credentialValues, request.getBlindedMs()));
        var signatureProof = SignatureUtils.generateSignatureProof(signature, keys, proverNonce);
        var issued = new ZkpCredentialManager().createCredential(definition, signature, signatureProof, values, request, offerNonce, UUID.randomUUID().toString());
        var holderCredential = bridge(issued, org.omnione.did.sdk.datamodel.zkp.Credential.class);
        var holderValues = CredentialValueHelper.generateCredentialValues(holderCredential.getValues(), master);
        require(CredentialVerifier.verify(holderCredential.getCredentialSignature(), holderCredential.getSignatureCorrectnessProof(), holderValues,
            publicKey, vPrime, proverNonce), "holder credential signature");
        RESULTS.put("issuanceAndHolderSignature", "passed");

        var policyDate = LocalDate.of(2026, 9, 20);
        int cutoff = Integer.parseInt(policyDate.minusYears(19).toString().replace("-", ""));
        require(cutoff == 20070920, "age cutoff");
        var verifierNonce = bindingNonce == null ? random.generateNonce() : bindingNonce;
        var requestJson = G.toJson(Map.of("name", "PROOFPASS_AGE_19", "version", "1.0", "nonce", verifierNonce.toString(),
            "requestedAttributes", Map.of(), "requestedPredicates", Map.of("age19", Map.of("name", "birthdate", "pType", "LE", "pValue", cutoff,
            "restrictions", List.of(Map.of("credDefId", definition.getId()))))));
        var holderProofRequest = G.fromJson(requestJson, org.omnione.did.sdk.datamodel.zkp.ProofRequest.class);
        var requested = new RequestedProof();
        requested.addPredicates(Map.of("age19", Map.of("subProofIndex", "0")));
        var nonCredential = new NonCredentialSchema();
        nonCredential.addAttr("masterSecret");
        var holderSchema = bridge(schema, org.omnione.did.sdk.datamodel.zkp.CredentialSchema.class);
        var holderProof = new ProofBuilder("masterSecret")
            .addSubProofRequest(holderProofRequest.getSubProofRequest(0, requested), holderSchema, nonCredential, holderValues,
                holderCredential.getCredentialSignature(), publicKey)
            .build(verifierNonce, requested, List.of(new Identifiers(schema.getId(), definition.getId())));
        var proof = bridge(holderProof, Proof.class);
        var proofRequest = G.fromJson(requestJson, ProofRequest.class);
        var params = List.of(new ProofVerifyParam.Builder().setSchema(schema).setCredentialDefinition(definition).build());
        var verifier = new ZkpProofManager();
        long verifyStarted = System.nanoTime();
        require(verifier.verifyProof(proof, verifierNonce, proofRequest, params), "valid presentation");
        if (bindingExport != null) {
            Files.createDirectories(bindingExport);
            Files.writeString(bindingExport.resolve("registry.json"), G.toJson(Map.of(
                "schema", schema, "definition", definition, "policyDate", policyDate.toString(), "issuerPolicyId", bindingPolicy)),
                java.nio.file.StandardOpenOption.CREATE_NEW);
            Files.writeString(bindingExport.resolve("proof.json"), G.toJson(proof), java.nio.file.StandardOpenOption.CREATE_NEW);
        }
        RESULTS.put("validPresentation", "accepted");
        RESULTS.put("verificationMs", (System.nanoTime() - verifyStarted) / 1_000_000);
        rejected("nonceChanged", () -> verifier.verifyProof(proof, verifierNonce.add(BigInteger.ONE), proofRequest, params));
        JsonObject mutated = G.toJsonTree(proof).getAsJsonObject();
        JsonObject aggregate = mutated.getAsJsonObject("aggregatedProof");
        aggregate.addProperty("cHash", new BigInteger(aggregate.get("cHash").getAsString()).add(BigInteger.ONE).toString());
        Proof tampered = G.fromJson(mutated, Proof.class);
        rejected("proofChanged", () -> verifier.verifyProof(tampered, verifierNonce, proofRequest, params));
        var otherDefinition = metadata.createDefinition("did:omn:untrusted-test-issuer", schema, keys.getPublicKey());
        var otherParams = List.of(new ProofVerifyParam.Builder().setSchema(schema).setCredentialDefinition(otherDefinition).build());
        rejected("issuerMismatch", () -> verifier.verifyProof(proof, verifierNonce, proofRequest, otherParams));
        RESULTS.put("policyDate", policyDate.toString());
        RESULTS.put("minimumAge", 19);
        RESULTS.put("totalMs", (System.nanoTime() - started) / 1_000_000);
        RESULTS.put("mode", "real-sdk-local-zkp-roundtrip-synthetic-identity");
        RESULTS.put("issuerCommit", "d1ba7410f7bebff7b743f94f6547306301e8dce7");
        RESULTS.put("holderCommit", "58c5582014908d47f1ce62340ce672727c6a1172");
        Path holderJar = Path.of(System.getenv("PROOFPASS_ROOT"), ".external/did-client-sdk-aos/source/release/did-wallet-sdk-aos-V2.0.1.jar");
        RESULTS.put("holderJarSha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(holderJar))));
        RESULTS.put("completedAt", Instant.now().toString());
    }
    public static void main(String[] args) throws Exception {
        PrintStream output = System.out;
        Throwable failure = null;
        System.setOut(new PrintStream(OutputStream.nullOutputStream()));
        try { roundTrip(); } catch (Throwable error) { failure = error; }
        finally { System.setOut(output); }
        if (failure != null) {
            System.err.println("Integration failure class: " + failure.getClass().getName());
            if (failure instanceof NoClassDefFoundError) System.err.println("Missing class: " + failure.getMessage());
            for (var frame : failure.getStackTrace()) System.err.println(frame);
            System.exit(1);
        }
        String json = new GsonBuilder().setPrettyPrinting().create().toJson(RESULTS);
        Path evidence = Path.of(System.getenv("PROOFPASS_ROOT"), "evidence/gate0/opendid-roundtrip.json");
        Files.writeString(evidence, json + "\n");
        System.out.println(json);
    }
}
