export default {
  async scheduled(controller, env) {
    const origin = env.PUBLIC_SITE_ORIGIN || env.CF_PAGES_URL;
    if (!origin || !env.FNG_SLACK_RECHECK_SECRET) return;

    const response = await fetch(new URL('/api/fng/slack-recheck/run', origin).toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fng-slack-recheck-secret': env.FNG_SLACK_RECHECK_SECRET,
      },
      body: JSON.stringify({ cron: controller.cron }),
    });
    if (!response.ok) throw new Error(`FNG Slack recheck failed: ${response.status}`);
  },
};
