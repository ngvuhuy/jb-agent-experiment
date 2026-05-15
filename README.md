An experiment on specialized self-improved agents.

To evaluate such agents, I created an esoteric language (EsoScript) that looks like Python and C mixed, but with hidden rules.

The agent only has access to an incomplete description of the language (in [esoscript_description_agent.md](./agent-context/esoscript_description_agent.md)) and the `esc` compiler.
Any other hidden rules must be found through trial-and-error.

To compile the compiler, run `./esoscript/compile-esc.sh` (or `cd esoscript && cargo build`). This will produce a `./esc` compiler binary. Copy this into the agent-context folder.

I used Pi.dev as the base for the agent harness, as it's minimal and easy to extend. All custom modifications are inside `./agent-context/pi-config/`, and those are what the agent will have access to.

To start the agent, run the `./run.sh` command. It will spin up a new Docker container that has Pi already installed. When inside, run `pi`.

To start the self-improvement loop of the agent, use the `/grow <target-name> <description of the task you are doing`. For example, `/grow esoscript-fizzbuzz Write an EsoScript command to solve FizzBuzz`.
There are additional tools that aids in this process, this includes `/atomic-...` commands that allows the agent to safely modify its own Pi harness without fear of breaking it; if the new extension code
cause Pi to not boot, it will safely rollback to the old version before those changes. If the new extension code works but not very well, you can use various `/atomic-rollback` and `/atomic-commit` to control
those. There are also `/validate-list` and `/validate <target-name> <finding-number>` commands that tells the agent to spawn a subagent to try to prove/disprove if the specific finding numbers are consistent
with every other findings or not.

During testing, I used `deepseek-v4-flash` model, but Pi is very flexible. Simply `export OPENAI_API_KEY=...` and use any OpenAI's models. Switch the models through `/model`
