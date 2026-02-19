import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDm4QFlXVY89QSTxfPJFsOvebLxGYgQDLg",
  authDomain: "controle-financeiro-6c339.firebaseapp.com",
  projectId: "controle-financeiro-6c339",
  storageBucket: "controle-financeiro-6c339.firebasestorage.app",
  messagingSenderId: "474233431352",
  appId: "1:474233431352:web:dec3e9d4f77b5474b40dcd"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const firebaseApi = {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,

  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch
};
