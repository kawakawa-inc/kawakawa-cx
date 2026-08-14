FROM mcr.microsoft.com/devcontainers/javascript-node:24

# Adds `pipefail` so a failing `curl` in a pipeline fails the build instead of
# being masked by a succeeding `tar`/`bash`. Note: podman ignores SHELL for the
# OCI image format, so no RUN below may *depend* on bash — any script that
# needs bash invokes it explicitly. The default /bin/sh here is dash, which
# has no `source` builtin and different `[[ ]]` semantics.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG ZELLIJ_VERSION=0.44.3

# System packages + postgresql-client-18 from the PGDG repo
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-common \
    && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
    && apt-get install -y --no-install-recommends postgresql-client-18 neovim \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# doctl (DigitalOcean CLI) - fetches latest release
RUN DOCTL_VERSION=$(curl -fsSL https://api.github.com/repos/digitalocean/doctl/releases/latest | grep '"tag_name"' | cut -d'"' -f4 | sed 's/v//') \
    && curl -fsSL "https://github.com/digitalocean/doctl/releases/download/v${DOCTL_VERSION}/doctl-${DOCTL_VERSION}-linux-amd64.tar.gz" \
        | tar -xz -C /usr/local/bin doctl \
    && chmod 755 /usr/local/bin/doctl

# zellij - official prebuilt static musl binary.
# Previously this was `cargo install --locked zellij`, which pulled in the
# entire Rust toolchain (~1.5GB) and several minutes of compile time to build
# a binary upstream already publishes. There is no Rust code in this repo.
RUN curl -fsSL "https://github.com/zellij-org/zellij/releases/download/v${ZELLIJ_VERSION}/zellij-x86_64-unknown-linux-musl.tar.gz" \
        | tar -xz -C /usr/local/bin zellij \
    && chmod 755 /usr/local/bin/zellij

# opencode. The installer hardcodes $HOME/.opencode/bin and edits shell rc
# files; installing as root that way puts the binary in /root, which the
# `node` container user cannot read. Install to a temp HOME, then relocate
# the binary to a system path.
RUN export HOME=/tmp/opencode-install \
    && curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path \
    && mv "$HOME/.opencode/bin/opencode" /usr/local/bin/opencode \
    && chmod 755 /usr/local/bin/opencode \
    && rm -rf "$HOME"

# `dev` wrapper. The target lives on the workspace bind mount, so this symlink
# is intentionally dangling at build time and resolves once the volume is
# mounted at runtime.
RUN ln -s /workspace/scripts/dev.sh /usr/local/bin/dev

# Enable corepack and prepare pnpm (requires root)
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
