// CareConnect service worker — medication reminders.
//
// Timers (setTimeout) only live as long as the browser keeps this worker alive, so the
// app re-sends SCHEDULE_REMINDER for every active reminder each time it opens.

// Pending timers, so re-scheduling the same reminder replaces it instead of duplicating it
const timers = new Map();

// Take control of open pages right away, so reminder events can reach them
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('message', (event) => {
  const data = event.data
  if (data?.type === 'CANCEL_REMINDER') {
    for (const [key, timer] of timers) {
      if (key.startsWith(`${data.id}|`)) {
        clearTimeout(timer)
        timers.delete(key)
      }
    }
    return
  }

  if (data?.type !== 'SCHEDULE_REMINDER') return
  const { id, medicationName, dosage, timeString, delay } = data

  const key = `${id}|${timeString}`
  clearTimeout(timers.get(key))

  timers.set(key, setTimeout(async () => {
    timers.delete(key)

    // 1. Fire browser notification
    if (self.Notification?.permission === 'granted') {
      self.registration.showNotification('CareConnect Reminder', {
        body: `${medicationName}${dosage ? ' — ' + dosage : ''}. Time to take your medication.`,
        icon: '/favicon.ico',
        tag: `reminder-${id}`,
        requireInteraction: true,
      })
    }

    // 2. Notify all open app windows
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    clients.forEach(client => client.postMessage({
      type: 'REMINDER_FIRED',
      id, medicationName, dosage, timeString
    }))
  }, delay))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) return clients[0].focus()
      return self.clients.openWindow('/')
    })
  )
})
