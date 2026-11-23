import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDocFromServer, getFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/gmail.send");

// Keep OAuth Gmail access token strictly in JS memory (never localStorage/sessionStorage)
let cachedGmailAccessToken: string | null = null;
let isSigningIn = false;

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<{ online: boolean; message?: string }> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return { online: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
      return { online: false, message: msg };
    }
    return { online: true };
  }
}

export function subscribeFirebaseAuth(
  onUserChange: (user: User | null, hasGmailToken: boolean) => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedGmailAccessToken = null;
      onUserChange(null, false);
      return;
    }
    onUserChange(user, Boolean(cachedGmailAccessToken));
  });
}

export async function signInWithGoogleForCloudAndGmail(): Promise<{
  user: User;
  accessToken: string;
}> {
  if (isSigningIn) {
    throw new Error("Autenticazione Google già in corso.");
  }
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Impossibile ottenere il token Gmail da Google Sign-In.");
    }
    cachedGmailAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedGmailAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

export function clearGmailAccessToken() {
  cachedGmailAccessToken = null;
}

export async function signOutGoogle(): Promise<void> {
  cachedGmailAccessToken = null;
  await signOut(auth);
}

void testConnection();
