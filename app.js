// app.js
// كل المنطق ديال التطبيق: تسجيل الدخول، الشات المباشر، والـ Premium

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔴 خاصك تبدل هادشي بالمفاتيح ديال مشروع Firebase ديالك (شوف README.md)
const firebaseConfig = {
  apiKey: "AIzaSyCRzdVr2Qxnurt5986RvmzdvNh9wUAOIFU",
  authDomain: "chatapp-d82d5.firebaseapp.com",
  projectId: "chatapp-d82d5",
  storageBucket: "chatapp-d82d5.firebasestorage.app",
  messagingSenderId: "584943662499",
  appId: "1:584943662499:web:9dd3f1a0cfc283b1279616",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const views = {};
document.querySelectorAll(".view").forEach((v) => (views[v.id] = v));

function showView(id) {
  Object.values(views).forEach((v) => v.classList.remove("active"));
  views[id].classList.add("active");
}

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// ---------- Auth state ----------
let currentUserData = null;
let usersUnsub = null;
let messagesUnsub = null;
let activeChat = null; // { chatId, otherUser }

onAuthStateChanged(auth, (user) => {
  if (user) {
    showView("view-chatlist");
    listenToUsers();
  } else {
    if (usersUnsub) usersUnsub();
    if (messagesUnsub) messagesUnsub();
    showView("view-login");
  }
});

// ---------- Login ----------
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  $("#login-error").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    $("#login-error").textContent = translateError(err.code);
  }
});

// ---------- Signup ----------
$("#signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#signup-name").value.trim();
  const email = $("#signup-email").value.trim();
  const password = $("#signup-password").value;
  $("#signup-error").textContent = "";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      name,
      email,
      isPremium: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    $("#signup-error").textContent = translateError(err.code);
  }
});

$("#go-signup").addEventListener("click", () => showView("view-signup"));
$("#go-login").addEventListener("click", () => showView("view-login"));

$("#logout-btn").addEventListener("click", () => signOut(auth));

function translateError(code) {
  const map = {
    "auth/invalid-email": "البريد الإلكتروني ماشي صحيح",
    "auth/user-not-found": "ماكاينش حساب بهاد البريد",
    "auth/wrong-password": "كلمة السر غالطة",
    "auth/invalid-credential": "المعلومات غالطة، عاود جرب",
    "auth/email-already-in-use": "هاد البريد مستعمل من قبل",
    "auth/weak-password": "كلمة السر خاصها 6 حروف/أرقام على الأقل",
  };
  return map[code] || "وقعت مشكلة، عاود المحاولة";
}

// ---------- Users list ----------
let allUsers = [];
function listenToUsers() {
  usersUnsub = onSnapshot(collection(db, "users"), (snap) => {
    allUsers = snap.docs
      .map((d) => d.data())
      .filter((u) => u.uid !== auth.currentUser.uid);
    renderUsers(allUsers);
  });
}

function renderUsers(list) {
  const ul = $("#users-list");
  ul.innerHTML = "";
  $("#users-empty").hidden = list.length > 0;
  list.forEach((u) => {
    const li = document.createElement("li");
    li.className = "user-row";
    li.innerHTML = `
      <div class="avatar">${(u.name || "?").charAt(0).toUpperCase()}</div>
      <div>
        <div class="user-name">${escapeHtml(u.name)}</div>
        <div class="user-sub">بدا الشات</div>
      </div>`;
    li.addEventListener("click", () => openChat(u));
    ul.appendChild(li);
  });
}

$("#search-users").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  renderUsers(allUsers.filter((u) => u.name?.toLowerCase().includes(q)));
});

// ---------- Chat room ----------
function getChatId(otherUid) {
  return [auth.currentUser.uid, otherUid].sort().join("_");
}

function openChat(otherUser) {
  const chatId = getChatId(otherUser.uid);
  activeChat = { chatId, otherUser };

  $("#chatroom-name").textContent = otherUser.name;
  $("#chatroom-avatar").textContent = (otherUser.name || "?").charAt(0).toUpperCase();

  setDoc(
    doc(db, "chats", chatId),
    { members: [auth.currentUser.uid, otherUser.uid], updatedAt: serverTimestamp() },
    { merge: true }
  );

  if (messagesUnsub) messagesUnsub();
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
  messagesUnsub = onSnapshot(q, (snap) => {
    renderMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });

  showView("view-chatroom");
}

function renderMessages(list) {
  const box = $("#messages");
  box.innerHTML = "";
  list.forEach((m) => {
    const div = document.createElement("div");
    div.className = "bubble " + (m.senderId === auth.currentUser.uid ? "me" : "other");
    div.textContent = m.text;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

$("#back-to-list").addEventListener("click", () => {
  if (messagesUnsub) messagesUnsub();
  showView("view-chatlist");
});

$("#message-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#message-input");
  const text = input.value.trim();
  if (!text || !activeChat) return;
  input.value = "";
  await addDoc(collection(db, "chats", activeChat.chatId, "messages"), {
    text,
    senderId: auth.currentUser.uid,
    createdAt: serverTimestamp(),
  });
});

// auto-grow textarea
$("#message-input").addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 100) + "px";
});

// ---------- Premium ----------
$("#open-premium").addEventListener("click", () => showView("view-premium"));
$("#back-from-premium").addEventListener("click", () => showView("view-chatlist"));

let selectedPlan = "monthly";
document.querySelectorAll(".plan-card").forEach((card) => {
  if (card.dataset.plan === selectedPlan) card.classList.add("selected");
  card.addEventListener("click", () => {
    document.querySelectorAll(".plan-card").forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    selectedPlan = card.dataset.plan;
  });
});

$("#subscribe-btn").addEventListener("click", async () => {
  // ⚠️ هادشي واجهة تجريبية فقط. الدفع الحقيقي خاصو Stripe/webhook - شوف README.md
  try {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      isPremium: true,
      plan: selectedPlan,
    });
    toast("مبروك 🎉 دابا عندك Premium!");
    showView("view-chatlist");
  } catch (e) {
    toast("ما قدرناش نفعلو الاشتراك، عاود جرب");
  }
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
