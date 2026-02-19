// firebase.js - Firebase integration for Drift Racers
// Auth (Google + Email/Password) + Realtime Database (Rankings + Ghosts)

var firebaseConfig = {
  apiKey: "AIzaSyB-RecxXYzniXGxmBOFNdZB7aEnYPZTizc",
  authDomain: "drift-racers-game.firebaseapp.com",
  databaseURL: "https://drift-racers-game-default-rtdb.firebaseio.com",
  projectId: "drift-racers-game",
  storageBucket: "drift-racers-game.firebasestorage.app",
  messagingSenderId: "475670640661",
  appId: "1:475670640661:web:be70b6654dcf33e0de361c"
};
var firebaseApp = null;
var firebaseAuth = null;
var firebaseDB = null;
var firebaseReady = false;

function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK not loaded');
    return;
  }
  // Config will be set after project creation
  if (!firebaseConfig) {
    console.warn('Firebase config not set');
    return;
  }
  try {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    firebaseAuth = firebase.auth();
    firebaseDB = firebase.database();
    firebaseReady = true;

    // Listen for auth state changes
    firebaseAuth.onAuthStateChanged(function(user) {
      if (user) {
        // Keep existing displayName if already set (e.g. from signupEmail before updateProfile completes)
        var existingName = currentUser && currentUser.uid === user.uid ? currentUser.displayName : null;
        currentUser = {
          uid: user.uid,
          displayName: existingName || user.displayName || user.email.split('@')[0],
          email: user.email
        };
        // Update/create user profile
        updateUserProfile(user.uid, {
          displayName: currentUser.displayName,
          lastLogin: Date.now()
        });
      } else {
        currentUser = null;
      }
      updateAccountBar();
    });

    console.log('Firebase initialized');
  } catch (e) {
    console.error('Firebase init error:', e);
  }
}

// === AUTH ===

function loginGoogle() {
  if (!firebaseAuth) return Promise.reject('Firebase not ready');
  var provider = new firebase.auth.GoogleAuthProvider();
  return firebaseAuth.signInWithPopup(provider).then(function(result) {
    return result.user;
  });
}

function loginEmail(email, pass) {
  if (!firebaseAuth) return Promise.reject('Firebase not ready');
  return firebaseAuth.signInWithEmailAndPassword(email, pass).then(function(result) {
    return result.user;
  });
}

function signupEmail(email, pass, name) {
  if (!firebaseAuth) return Promise.reject('Firebase not ready');
  return firebaseAuth.createUserWithEmailAndPassword(email, pass).then(function(result) {
    return result.user.updateProfile({ displayName: name }).then(function() {
      currentUser = {
        uid: result.user.uid,
        displayName: name,
        email: email
      };
      if (typeof updateAccountBar === 'function') updateAccountBar();
      return result.user;
    });
  });
}

function logoutFirebase() {
  if (!firebaseAuth) return Promise.reject('Firebase not ready');
  return firebaseAuth.signOut();
}

// === USER PROFILE ===

function updateUserProfile(uid, data) {
  if (!firebaseDB) return;
  firebaseDB.ref('users/' + uid).update(data);
}

function getUserProfile(uid, callback) {
  if (!firebaseDB) { callback(null); return; }
  firebaseDB.ref('users/' + uid).once('value').then(function(snap) {
    callback(snap.val());
  });
}

// === RANKINGS ===

function uploadRanking(raceResult) {
  if (!firebaseDB || !currentUser) return Promise.resolve();
  var entry = {
    uid: currentUser.uid,
    displayName: currentUser.displayName,
    charIdx: raceResult.charIdx,
    kartIdx: raceResult.kartIdx,
    equipIdx: raceResult.equipIdx,
    time: raceResult.time,
    timestamp: Date.now()
  };
  // Push to rankings
  var pushPromise = firebaseDB.ref('rankings').push(entry);

  // Update user best time
  getUserProfile(currentUser.uid, function(profile) {
    if (!profile || !profile.bestTime || raceResult.time < profile.bestTime) {
      updateUserProfile(currentUser.uid, {
        bestTime: raceResult.time,
        totalRaces: (profile && profile.totalRaces || 0) + 1
      });
    } else {
      updateUserProfile(currentUser.uid, {
        totalRaces: (profile && profile.totalRaces || 0) + 1
      });
    }
  });

  return pushPromise;
}

function getRankings(limit, callback) {
  if (!firebaseDB) { callback([]); return; }
  firebaseDB.ref('rankings')
    .orderByChild('time')
    .limitToFirst(limit || 20)
    .once('value')
    .then(function(snap) {
      var results = [];
      snap.forEach(function(child) {
        var val = child.val();
        val.key = child.key;
        results.push(val);
      });
      callback(results);
    });
}

// === GHOSTS ===

function uploadGhost(ghostData) {
  if (!firebaseDB || !currentUser) return Promise.resolve();
  var entry = {
    uid: currentUser.uid,
    displayName: currentUser.displayName,
    charIdx: ghostData.charIdx,
    kartIdx: ghostData.kartIdx,
    equipIdx: ghostData.equipIdx,
    time: ghostData.time,
    timestamp: Date.now(),
    samples: ghostData.samples
  };
  return firebaseDB.ref('ghosts').push(entry);
}

function getTopGhosts(n, callback) {
  if (!firebaseDB) { callback([]); return; }
  firebaseDB.ref('ghosts')
    .orderByChild('time')
    .limitToFirst(n || 5)
    .once('value')
    .then(function(snap) {
      var results = [];
      snap.forEach(function(child) {
        results.push(child.val());
      });
      callback(results);
    });
}
