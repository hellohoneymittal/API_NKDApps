import {
  exchangeGoogleCode,
  getGoogleOAuthUrls,
} from "./utils/googleConfig.js";

import { callAppsScript } from "./api/CommonMethod.js";

const APP_S_ID_MAP = {
  NKDSadhnaTool: "1Qbs3XsZvEFDW9vol10og9V4BqPjhu7w6AuhVuGO5BADFFfEUdt32RVaa",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method === "GET" && url.pathname === "/oauth/start") {
      const state = createOAuthState();
      const oauthUrl = await getGoogleOAuthUrls(env, state);

      return new Response(null, {
        status: 302,
        headers: {
          Location: oauthUrl,
          "Set-Cookie": `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/oauth/callback") {
      try {
        const cookie = request.headers.get("Cookie") || "";
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");

        const stateMatch = cookie.match(/oauth_state=([^;]+)/);
        const storedState = stateMatch?.[1];

        if (!code) {
          throw new Error("Authorization code missing");
        }

        if (!returnedState || !storedState || returnedState !== storedState) {
          throw new Error("Invalid OAuth state");
        }

        const tokenData = await exchangeGoogleCode(code, env);

        return new Response(
          JSON.stringify({
            status: true,
            message: "Google OAuth successful",
            accessTokenReceived: !!tokenData.access_token,
            refreshTokenReceived: !!tokenData.refresh_token,
            expiresIn: tokenData.expires_in,
            scope: tokenData.scope,
            refreshToken: tokenData.refresh_token || null,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie":
                "oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
            },
          },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: false,
            message: error?.message || "OAuth callback failed",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/test-apps-script") {
      try {
        const result = await runAppsScriptFunction(
          env,
          "TEST_EMAIL_PERMISSION",
        );

        return new Response(
          JSON.stringify({
            status: true,
            message: "Apps Script executed successfully",
            result,
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: false,
            message: error?.message || "Apps Script execution failed",
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
    }

    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: true,
          message: "Cloudflare Worker is running",
          service: "Google Sheets API",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          status: false,
          message: "Only GET, POST and OPTIONS methods are allowed",
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    try {
      const requestData = await request.json();

      const apiTypeMethodName = requestData.apiType;
      const inputData = requestData.inputData || {};
      const appName = String(inputData.appName || requestData.appName || "")
        .trim()
        .toUpperCase();
      const appScriptId = APP_S_ID_MAP[appName];

      let response;

      switch (apiTypeMethodName) {
        default: {
          if (!appScriptId) {
            response = {
              status: false,
              message:
                "Invalid or missing appName. Please provide a valid appName.",
              appName: appName || null,
              apiType: apiTypeMethodName,
            };
            break;
          }

          if (appName === "NKDSadhnaTool") {
            switch (apiTypeMethodName) {
              case "Testing":
                response = await callAppsScript(
                  env,
                  appScriptId,
                  apiTypeMethodName,
                  inputData,
                );
                break;

              default:
                response = {
                  status: false,
                  message: `Invalid apiType for ${appName}`,
                  apiType: apiTypeMethodName,
                  appName,
                };
                break;
            }
          }

          break;
        }
      }

      const isSuccess = response?.status !== false;
      const responseData = response ?? {};

      if (responseData && typeof responseData === "object") {
        delete responseData.status;
      }

      return new Response(
        JSON.stringify({
          status: isSuccess,
          data: responseData,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      console.error("Worker Error:", error?.stack || error);

      return new Response(
        JSON.stringify({
          status: false,
          data: {
            message: error?.message || "Internal server error",
            error: {
              code: error?.code || 500,
              type: error?.errorType || "INTERNAL_ERROR",
              function: error?.functionName || null,
              lineNumber: error?.lineNumber ?? null,
              stackTrace: error?.stackTrace || [],
            },
          },
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  },
};
