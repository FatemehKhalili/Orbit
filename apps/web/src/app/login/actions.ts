"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDeviceToken, rememberDevice, startSession } from "@/lib/auth";
import { loginWithApi } from "@/lib/auth-api";
import { clientIpFrom } from "@/lib/client-ip";
import { performLogin, type LoginState } from "@/lib/login";

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const context = { deviceToken: await getDeviceToken(), clientIp: clientIpFrom(await headers()) };
  const state = await performLogin(formData, {
    login: (email, password) => loginWithApi(email, password, context),
    startSession,
    rememberDevice,
  });
  if (state) return state;
  redirect("/");
}
