/* 메타송이 클래스 — Firebase 설정
 *
 * 이 파일은 공개 저장소에 올라갑니다.
 * firebaseConfig의 apiKey는 Firebase 웹 앱의 공개용 키이므로 노출되어도
 * 괜찮습니다 (실제 권한은 Firestore 보안 규칙이 통제).
 * 단, Google Cloud Console에서 이 키의 HTTP 리퍼러를
 * https://metasongi.github.io/* 로 제한해 두는 것을 권장합니다.
 *
 * 강사 이메일 allowlist는 공개 저장소에 두지 않습니다.
 * Firestore의 config/admins 문서 { emails: [...] } 로 관리합니다
 * (로그인한 사용자만 읽을 수 있음).
 */
window.HINA_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDPi4lLYi9nJGUyElJmA6bFMl-vWsdCT8E",
    authDomain: "hina-class.firebaseapp.com",
    projectId: "hina-class",
    storageBucket: "hina-class.firebasestorage.app",
    messagingSenderId: "210145740964",
    appId: "1:210145740964:web:4711ecb47b77a73317be31"
  }
};
