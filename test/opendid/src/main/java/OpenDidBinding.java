import com.google.gson.*;
import java.io.*;
import java.math.BigInteger;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import org.omnione.did.zkp.core.manager.ZkpProofManager;
import org.omnione.did.zkp.datamodel.schema.CredentialSchema;
import org.omnione.did.zkp.datamodel.definition.CredentialDefinition;
import org.omnione.did.zkp.datamodel.proof.Proof;
import org.omnione.did.zkp.datamodel.proof.verifyparam.ProofVerifyParam;
import org.omnione.did.zkp.datamodel.proofrequest.ProofRequest;

public class OpenDidBinding {
    static final Gson G = new Gson();
    static void requireExpectedProof(JsonObject raw, CredentialSchema schema, CredentialDefinition definition, int cutoff) {
        // The pinned SDK verifies supplied subproofs, but does not require them or
        // bind their predicates to the verifier's request. Enforce that boundary here.
        JsonArray proofs = raw.getAsJsonArray("proofs");
        JsonArray identifiers = raw.getAsJsonArray("identifiers");
        if (proofs.size() != 1 || identifiers.size() != 1) throw new IllegalArgumentException("One credential required");
        JsonElement expectedId = G.toJsonTree(Map.of("schemaId", schema.getId(), "credDefId", definition.getId()));
        if (!identifiers.get(0).equals(expectedId)) throw new IllegalArgumentException("Untrusted identifier");
        JsonElement expectedRequested = G.toJsonTree(Map.of("selfAttestedAttrs", Map.of(), "revealedAttrs", Map.of(),
            "unrevealedAttrs", Map.of(), "predicates", Map.of("age19", Map.of("subProofIndex", "0"))));
        if (!raw.get("requestedProof").equals(expectedRequested)) throw new IllegalArgumentException("Requested proof mismatch");
        JsonArray inequalities = proofs.get(0).getAsJsonObject().getAsJsonObject("primaryProof").getAsJsonArray("neProofs");
        if (inequalities.size() != 1) throw new IllegalArgumentException("One age predicate required");
        JsonElement predicate = G.toJsonTree(Map.of("attrName", "birthdate", "pType", "LE", "pValue", cutoff));
        if (!inequalities.get(0).getAsJsonObject().get("predicate").equals(predicate))
            throw new IllegalArgumentException("Age predicate does not match policy");
    }
    static Path privatePath(String value) throws Exception {
        Path root = Path.of(System.getenv("PROOFPASS_ROOT"), ".local").toRealPath();
        Path path = Path.of(value).toAbsolutePath().normalize();
        if (!path.startsWith(root)) throw new IllegalArgumentException("Private path required");
        return path;
    }
    static Map<String,Object> run(String[] args) throws Exception {
        BigInteger nonce = new BigInteger(args[1]);
        if (nonce.signum() < 0 || nonce.bitLength() > 128) throw new IllegalArgumentException("Nonce range");
        if (args[0].equals("issue")) {
            if (!args[3].matches("[0-9a-f]{64}")) throw new IllegalArgumentException("Policy");
            OpenDidRoundTrip.bindingNonce = nonce;
            OpenDidRoundTrip.bindingExport = privatePath(args[2]);
            OpenDidRoundTrip.bindingPolicy = args[3];
            OpenDidRoundTrip.roundTrip();
            return Map.of("issued", true, "nonce", nonce.toString());
        }
        if (!args[0].equals("verify")) throw new IllegalArgumentException("Unknown command");
        // Registry is passed only by the operator-configured adapter, never from proof contents.
        JsonObject registry = G.fromJson(Files.readString(privatePath(args[2])), JsonObject.class);
        Path proofPath = privatePath(args[3]);
        if (Files.size(proofPath) > 1_000_000) throw new IllegalArgumentException("Proof too large");
        JsonObject rawProof = G.fromJson(Files.readString(proofPath), JsonObject.class);
        if (!rawProof.keySet().equals(Set.of("proofs", "aggregatedProof", "requestedProof", "identifiers")))
            throw new IllegalArgumentException("Unexpected proof fields");
        var schema = G.fromJson(registry.get("schema"), CredentialSchema.class);
        var definition = G.fromJson(registry.get("definition"), CredentialDefinition.class);
        int cutoff = Integer.parseInt(LocalDate.parse(registry.get("policyDate").getAsString()).minusYears(19).toString().replace("-", ""));
        requireExpectedProof(rawProof, schema, definition, cutoff);
        var request = G.fromJson(G.toJson(Map.of("name", "PROOFPASS_AGE_19", "version", "1.0", "nonce", nonce.toString(),
            "requestedAttributes", Map.of(), "requestedPredicates", Map.of("age19", Map.of("name", "birthdate", "pType", "LE", "pValue", cutoff,
            "restrictions", List.of(Map.of("credDefId", definition.getId())))))), ProofRequest.class);
        boolean accepted = new ZkpProofManager().verifyProof(G.fromJson(rawProof, Proof.class), nonce, request,
            List.of(new ProofVerifyParam.Builder().setSchema(schema).setCredentialDefinition(definition).build()));
        if (!accepted) throw new IllegalArgumentException("Proof rejected");
        return Map.of("verified", true, "nonce", nonce.toString(), "issuerPolicyId", registry.get("issuerPolicyId").getAsString());
    }
    public static void main(String[] args) {
        PrintStream out = System.out, err = System.err;
        System.setOut(new PrintStream(OutputStream.nullOutputStream()));
        System.setErr(new PrintStream(OutputStream.nullOutputStream()));
        Map<String,Object> result;
        try { result = run(args); }
        catch (Throwable failure) {
            System.setOut(out); System.setErr(err);
            System.err.println("OpenDID binding operation rejected");
            System.exit(1); return;
        }
        System.setOut(out); System.setErr(err);
        System.out.println(G.toJson(result));
    }
}
