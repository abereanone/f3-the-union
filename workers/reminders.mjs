export default {
  async scheduled(controller, env) {
    const origin = env.PUBLIC_SITE_ORIGIN || env.CF_PAGES_URL;
    if (!origin || !env.REMINDER_RUN_SECRET) return;

    await fetch(new URL('/api/reminders/run', origin).toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-reminder-secret': env.REMINDER_RUN_SECRET,
      },
      body: JSON.stringify({ cron: controller.cron }),
    });
  },
};
