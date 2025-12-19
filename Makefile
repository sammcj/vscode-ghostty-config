.PHONY: all build lint lint-fix test package clean install watch install-extension

all: build

install:
	pnpm install

build: install
	pnpm run compile

lint:
	pnpm run lint

lint-fix:
	pnpm run lint:fix

test: build
	pnpm test

package: build lint
	pnpm run package

install-extension: package
	$$SHELL -ic 'code --install-extension ghostty-config-*.vsix --force'

clean:
	rm -rf out node_modules *.vsix

watch:
	pnpm run watch

help:
	@echo "Available targets:"
	@echo "  all               - Default target, builds the project"
	@echo "  install           - Install project dependencies"
	@echo "  build             - Compile the project"
	@echo "  lint              - Lint the source code"
	@echo "  lint-fix          - Fix linting issues in the source code"
	@echo "  test              - Run tests"
	@echo "  package           - Package the project"
	@echo "  install-extension - Package and install into VSCode"
	@echo "  clean             - Clean build artifacts and dependencies"
	@echo "  watch             - Watch for changes and rebuild automatically"

.DEFAULT_GOAL := build
