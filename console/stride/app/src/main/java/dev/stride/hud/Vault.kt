package dev.stride.hud

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encrypts the TrailMate tokens before they are stored.
 *
 * A token has to be sent back to TrailMate as it was given, so it is
 * encrypted rather than hashed: salting and hashing suit a password the
 * console only checks, not a secret it must use. The key is an AES-256 key in
 * the Android Keystore, made on this console and never readable by this app or
 * anything else: the app can only ask the Keystore to encrypt and decrypt
 * with it. So a copy of the app's files, or of `stride.db`, holds tokens that
 * are useless anywhere else.
 *
 * AES-GCM, with a fresh 12-byte nonce per token, stored in front of the
 * ciphertext. GCM also authenticates, so a tampered value fails to decrypt
 * rather than decrypting to rubbish.
 */
object Vault {
    private const val STORE = "AndroidKeyStore"
    private const val ALIAS = "stride.trailmate"
    private const val NONCE = 12
    private const val TAG_BITS = 128

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance(STORE).apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, STORE)
        gen.init(KeyGenParameterSpec.Builder(ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build())
        return gen.generateKey()
    }

    fun seal(plain: String): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        return c.iv + c.doFinal(plain.toByteArray(Charsets.UTF_8))
    }

    /** The token, or null if it cannot be decrypted — treated as not linked. */
    fun open(sealed: ByteArray): String? = try {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, sealed, 0, NONCE))
        String(c.doFinal(sealed, NONCE, sealed.size - NONCE), Charsets.UTF_8)
    } catch (e: Exception) {
        null
    }
}
