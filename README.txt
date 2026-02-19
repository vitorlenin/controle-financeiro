Como usar (local):
- Abra index.html via um servidor local (ex: VSCode Live Server) OU publique no Firebase Hosting.

Firestore (sugestão de rules):
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/transactions/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}

Relatórios:
- CSV: botão Exportar CSV gera arquivo.
- PDF: botão Exportar PDF abre a impressão (salvar como PDF).
