.PHONY: all build lint test package clean install watch package-install setup sync-config

all: build

setup:
	git config core.hooksPath .githooks

install: setup
	pnpm install

build: install
	pnpm run compile

lint:
	pnpm run lint:fix

test: build
	pnpm test

package: lint test build
	pnpm run package

package-install: package
	$$SHELL -ic 'code --package-install ghostty-config-syntax-*.vsix --force'

sync-config:
	./scripts/sync-ghostty-config.sh

clean:
	rm -rf out node_modules *.vsix

watch:
	pnpm run watch

help:
	@echo "Available targets:"
	@echo "  all               - Default target, builds the project"
	@echo "  setup             - Configure git hooks"
	@echo "  install           - Install dependencies and setup hooks"
	@echo "  build             - Compile the project"
	@echo "  lint              - Lint the source code"
	@echo "  test              - Run tests"
	@echo "  package           - Package the project"
	@echo "  package-install - Package and install into VSCode"
	@echo "  sync-config       - Compare schema with upstream Ghostty config"
	@echo "  clean             - Clean build artifacts and dependencies"
	@echo "  watch             - Watch for changes and rebuild automatically"

.DEFAULT_GOAL := build
