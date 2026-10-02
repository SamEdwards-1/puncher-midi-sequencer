# CLAUDE.md

## Ending a task

When a task changes anything visible in the app, finish by running it in the
preview (the `midiseq-app` configuration in `.claude/launch.json`) and give the
preview URL (e.g. `http://localhost:<port>`) at the end of the summary, so the
change can be checked straight away. Skip it for changes the app can't show,
such as tests, tooling or docs.
