// app.js
// كل المنطق ديال التطبيق: تسجيل الدخول، الشات المباشر، الـ Premium، والبروفايل

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
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatTime(ts) {
  if (!ts || !ts.toDate) return "";
  const d = ts.toDate();
  return d.toLocaleTimeString("ar-MA", { hour: "2-digit", minute: "2-digit" });
}

// ---------- Bottom nav (shared across tabs) ----------
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(`.nav-item[data-tab="${tab}"]`).forEach((b) => b.classList.add("active"));
    if (tab === "chats") showView("view-chatlist");
    if (tab === "discover") { showView("view-discover"); startDiscover(); }
    if (tab === "premium") showView("view-premium");
    if (tab === "profile") { showView("view-profile"); renderProfile(); }
  });
});

// ---------- Auth state ----------
let usersUnsub = null;
let messagesUnsub = null;
let activeChat = null;
let myUserData = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    showView("view-chatlist");
    listenToUsers();
    listenToMyProfile();
  } else {
    if (usersUnsub) usersUnsub();
    if (messagesUnsub) messagesUnsub();
    showView("view-login");
  }
});

function listenToMyProfile() {
  onSnapshot(doc(db, "users", auth.currentUser.uid), (snap) => {
    myUserData = snap.data();
    renderProfile();
  });
}

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
  const bio = $("#signup-bio").value.trim();
  $("#signup-error").textContent = "";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      name,
      email,
      bio: bio || "",
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

// ---------- Users list + status row ----------
let allUsers = [];
function listenToUsers() {
  usersUnsub = onSnapshot(collection(db, "users"), (snap) => {
    allUsers = snap.docs.map((d) => d.data()).filter((u) => u.uid !== auth.currentUser.uid);
    renderUsers(allUsers);
    renderStatusRow(allUsers);
  });
}

function renderStatusRow(list) {
  const row = $("#status-row");
  row.innerHTML = "";
  list.slice(0, 10).forEach((u) => {
    const item = document.createElement("div");
    item.className = "status-item";
    item.innerHTML = `
      <div class="status-ring">
        <div class="avatar">${(u.name || "?").charAt(0).toUpperCase()}</div>
      </div>
      <span>${escapeHtml((u.name || "").split(" ")[0])}</span>`;
    item.addEventListener("click", () => openChat(u));
    row.appendChild(item);
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
    li.addEventListener("click", () => { openChat(u); });
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

async function openChat(otherUser) {
  const chatId = getChatId(otherUser.uid);
  activeChat = { chatId, otherUser };

  $("#chatroom-name").textContent = otherUser.name;
  $("#chatroom-avatar").textContent = (otherUser.name || "?").charAt(0).toUpperCase();

  await setDoc(
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
    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap " + (m.senderId === auth.currentUser.uid ? "me" : "other");
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = m.text;
    const time = document.createElement("div");
    time.className = "bubble-time";
    time.textContent = formatTime(m.createdAt);
    wrap.appendChild(bubble);
    wrap.appendChild(time);
    box.appendChild(wrap);
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
  input.style.height = "auto";
  await addDoc(collection(db, "chats", activeChat.chatId, "messages"), {
    text,
    senderId: auth.currentUser.uid,
    createdAt: serverTimestamp(),
  });
});

$("#message-input").addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 100) + "px";
});

// ---------- Premium ----------
$("#copy-rib-btn").addEventListener("click", async () => {
  const rib = $("#rib-value").textContent.trim();
  try {
    await navigator.clipboard.writeText(rib);
    toast("تنسخ RIB ✅");
  } catch (e) {
    toast("ما قدرناش ننسخو، انسخو بيدك");
  }
});

$("#confirm-transfer-btn").addEventListener("click", async () => {
  try {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      premiumRequested: true,
      premiumRequestedAt: serverTimestamp(),
    });
    $("#premium-status-note").textContent =
      "توصلنا بالطلب ديالك ✅ غادي نفعلو ليك Premium فأقرب وقت منين نتأكدو من التحويل.";
  } catch (e) {
    toast("وقعت مشكلة، عاود جرب");
  }
});

// ---------- Profile ----------
function renderProfile() {
  if (!myUserData) return;
  $("#profile-avatar").textContent = (myUserData.name || "?").charAt(0).toUpperCase();
  $("#profile-name").textContent = myUserData.name || "";
  $("#profile-email").textContent = myUserData.email || "";
  const badge = $("#profile-badge");
  if (myUserData.isPremium) {
    badge.textContent = "⭐ عضو Premium";
    badge.className = "profile-badge premium";
  } else {
    badge.textContent = "حساب مجاني";
    badge.className = "profile-badge free";
  }
}

// ---------- Discover / Match ----------
let discoverQueue = [];
let discoverStarted = false;

function startDiscover() {
  // كنبنيو لائحة ديال الناس اللي مازال ما عجبتيهمش
  discoverQueue = allUsers.slice();
  renderNextCard();
  discoverStarted = true;
}

function renderNextCard() {
  const stage = $("#card-stage");
  stage.querySelectorAll(".profile-card").forEach((c) => c.remove());
  $("#discover-empty").hidden = discoverQueue.length > 0;
  if (discoverQueue.length === 0) return;

  const u = discoverQueue[0];
  const card = document.createElement("div");
  card.className = "profile-card";
  card.innerHTML = `
    <div class="card-photo"><div class="avatar">${(u.name || "?").charAt(0).toUpperCase()}</div></div>
    <div class="card-info">
      <div class="card-name">${escapeHtml(u.name)}</div>
      <div class="card-bio">${escapeHtml(u.bio || "ماكاينش وصف بعد")}</div>
    </div>`;
  stage.appendChild(card);
}

$("#pass-btn").addEventListener("click", () => {
  if (!discoverQueue.length) return;
  animateCardOut("left");
});

$("#like-btn").addEventListener("click", async () => {
  if (!discoverQueue.length) return;
  const target = discoverQueue[0];
  animateCardOut("right");
  await sendLike(target);
});

function animateCardOut(direction) {
  const card = $("#card-stage").querySelector(".profile-card");
  if (!card) return;
  card.classList.add(direction === "left" ? "leaving-left" : "leaving-right");
  setTimeout(() => {
    discoverQueue.shift();
    renderNextCard();
  }, 300);
}

async function sendLike(target) {
  const myUid = auth.currentUser.uid;
  const likeId = `${myUid}_${target.uid}`;
  const reverseId = `${target.uid}_${myUid}`;
  try {
    await setDoc(doc(db, "likes", likeId), {
      from: myUid,
      to: target.uid,
      createdAt: serverTimestamp(),
    });
    // كنشوفو واش هو عجبني هو الآخر (إعجاب متبادل = Match)
    const reverseSnap = await getDoc(doc(db, "likes", reverseId));
    if (reverseSnap.exists()) {
      showMatch(target);
    } else {
      toast("تصيفط الإعجاب ✅");
    }
  } catch (e) {
    toast("وقعت مشكلة، عاود جرب");
  }
}

function showMatch(otherUser) {
  $("#match-avatar-me").textContent = (myUserData?.name || "?").charAt(0).toUpperCase();
  $("#match-avatar-them").textContent = (otherUser.name || "?").charAt(0).toUpperCase();
  $("#match-text").textContent = `نتا و${otherUser.name} عجبتيو لبعضياكم! بداو الشات دابا`;
  $("#match-modal").hidden = false;
  $("#match-chat-btn").onclick = () => {
    $("#match-modal").hidden = true;
    openChat(otherUser);
  };
}

$("#match-close-btn").addEventListener("click", () => {
  $("#match-modal").hidden = true;
});


// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
