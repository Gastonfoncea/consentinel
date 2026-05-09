// Consentinel Web Push service worker.
// Receives pushes dispatched from /api/push and renders a system
// notification on the user's device. Click on the notification focuses
// (or opens) the dashboard so the user lands on the verification flow.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_err) {
    payload = { title: "Consentinel", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Consentinel";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "consentinel-push",
    requireInteraction: true,
    data: {
      url: payload.url || "/",
      requestId: payload.requestId,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // Focus an existing tab on the same origin if we can find one.
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            if ("navigate" in client) {
              try {
                client.navigate(targetUrl);
              } catch (_err) {
                // Some browsers reject navigate() across cross-document
                // boundaries — focusing is enough.
              }
            }
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
