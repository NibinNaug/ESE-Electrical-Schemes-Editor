# Mises à jour OTA d’ESE

ESE recherche les releases publiées du dépôt GitHub officiel, y compris les
préversions. La vérification est lancée discrètement au démarrage et reste
accessible avec le bouton **Mises à jour**.

## Modèle de sécurité

- Windows et Linux téléchargent le `latest.json` propre à la release choisie.
  Le backend Tauri refuse toute autre origine, vérifie la signature de
  l’artefact avec la clé publique embarquée, installe puis redémarre ESE.
- Android n’accepte que `ESE-Android-Universal.apk` dans une release du dépôt
  officiel. L’empreinte SHA-256 fournie par l’API GitHub est obligatoire et
  vérifiée avant l’ouverture de l’installateur. Android exige ensuite que le
  nouvel APK soit signé par le même certificat permanent que l’application
  déjà installée.
- L’installation Android reste confirmée par l’utilisateur. Si nécessaire,
  ESE ouvre d’abord le réglage système autorisant cette source d’installation.
- Les projets modifiés sont copiés dans la récupération privée avant de lancer
  l’installation, mais l’interface recommande toujours un enregistrement
  explicite.

La clé privée Tauri se trouve uniquement dans
`tmp/private/ese-updater.key`, chemin ignoré par Git. Elle ne doit jamais être
déplacée dans une source versionnée ou perdue : sans elle, les installations
desktop existantes refuseraient toutes les futures mises à jour. La clé Android
existante et `keystore.properties` restent également privés.

## Secrets GitHub Actions

Le workflow `.github/workflows/release.yml` attend :

- `ESE_TAURI_SIGNING_PRIVATE_KEY` : contenu de la clé privée Tauri ;
- `ESE_ANDROID_KEYSTORE_BASE64` : keystore Android encodé en base64 ;
- `ESE_ANDROID_KEY_ALIAS` ;
- `ESE_ANDROID_KEY_PASSWORD` ;
- `ESE_ANDROID_STORE_PASSWORD`.

GitHub fournit lui-même `GITHUB_TOKEN`. Les secrets ne doivent apparaître ni
dans les logs, ni dans `SHA256SUMS.txt`, ni dans un artefact de release.

## Publier une version

1. Augmenter la SemVer dans `package.json`, `src-tauri/Cargo.toml` et
   `src-tauri/tauri.conf.json`.
2. Augmenter `bundle.android.versionCode` dans `tauri.conf.json`.
3. Compléter `CHANGELOG.md`, puis exécuter :

   ```powershell
   npm run check:release-version
   npm test
   npm run build
   npm run check:rust
   ```

4. Envoyer l’état validé sur GitHub et lancer manuellement le workflow
   **Publish ESE release**.
5. Tester l’upgrade depuis la version publique précédente sur un poste Windows,
   un poste Linux réel et un appareil Android avant d’annoncer la release.

Le workflow publie une release `v<version>`, les paquets desktop signés, le
manifeste Tauri `latest.json`, l’APK universel signé et son SHA-256. La toute
première version contenant ce mécanisme doit naturellement être installée de
façon classique ; les versions suivantes pourront arriver par OTA.
