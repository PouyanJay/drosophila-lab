# Thin dispatcher, adapted from Lunaris. Scripts own setup/lifecycle/verification.
SHELL := /bin/bash
.DEFAULT_GOAL := help
export WEB_PORT TRAINER_PORT SUPABASE_PORT_BASE BACKUP
.PHONY: help setup run start start-all stop status check-ports logs test test-web test-python test-research live-cost-check lint lint-fix build check check-agents backup restore
help:
	@./scripts/dev.sh help
setup:
	@./scripts/dev.sh setup
# One serialized script avoids racing setup/start with make -j.
run:
	@./scripts/dev.sh run
start start-all:
	@./scripts/dev.sh start
stop:
	@./scripts/dev.sh stop
status:
	@./scripts/dev.sh status
check-ports:
	@./scripts/dev.sh check-ports
logs:
	@./scripts/dev.sh logs
test:
	@./scripts/dev.sh test
test-web:
	@./scripts/dev.sh test-web
test-python:
	@./scripts/dev.sh test-python
test-research:
	@./scripts/dev.sh test-research
live-cost-check:
	@./scripts/dev.sh live-cost-check
lint:
	@./scripts/dev.sh lint
lint-fix:
	@./scripts/dev.sh lint-fix
build:
	@./scripts/dev.sh build
check:
	@./scripts/dev.sh check
check-agents:
	@./scripts/dev.sh check-agents
backup:
	@./scripts/dev.sh backup
restore:
	@./scripts/dev.sh restore
