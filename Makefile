# Ray808 — common tasks. `make` (or `make help`) lists them.
#
# Generated projects (Ray808.app, Ray808-ios/, Ray808-android/) are not versioned: create
# them once with the bundle-* targets. After that, a change to the React page or to src/*.ray
# only needs the static library rebuilt (ios-lib), which never touches the Xcode project or
# its signing (keep DEVELOPMENT_TEAM in Ray808-ios/App.xcconfig; since raylang 1.27.13 a team
# chosen in Xcode's Signing tab is also rescued into it on regeneration).

APP     := Ray808
IOS     := $(APP)-ios
ANDROID := $(APP)-android
NPM     := npm --prefix frontend
SHARED  := $(IOS)/$(APP).xcodeproj/xcshareddata

.DEFAULT_GOAL := help
.PHONY: help install dev dev-device test test-backend lint build smoke icon \
        bundle-macos bundle-ios ios-lib ios-lib-sim ios-libs ios-sim-build \
        bundle-android android-apk

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-18s %s\n", $$1, $$2}'

install: ## Install the frontend packages
	$(NPM) install

# ---- Development ----

dev: ## Desktop window over the Vite dev server (hot reload of page and program)
	ray dev

dev-device: ## Vite on the LAN for hot reload on a phone (enable RAY808_DEV_URL in the Xcode scheme)
	@echo "Enable RAY808_DEV_URL=http://$$(ipconfig getifaddr en0 2>/dev/null || hostname):5173 in the Xcode scheme, then Run."
	$(NPM) run dev:device

# ---- Checks ----

test: test-backend lint build smoke ## Everything: backend tests, lint, build and smoke test

test-backend: ## raylang backend tests
	ray test

lint: ## oxlint over the frontend
	$(NPM) run lint

build: ## Build the frontend (frontend/dist)
	$(NPM) run build

smoke: build ## Headless Chrome smoke test, desktop and phone viewports
	$(NPM) run smoke

icon: ## Render assets/icon.png
	cd frontend && node scripts/make-icon.mjs

# ---- macOS ----

bundle-macos: ## Build Ray808.app
	ray bundle

# ---- iOS ----

# `ray bundle --ios` rewrites Ray808.xcodeproj as a whole, shared scheme included (the one that
# carries RAY808_DEV_URL): keep a copy of xcshareddata/ and put it back afterwards.
bundle-ios: ## (Re)generate the Xcode project in Ray808-ios/ — only when [app] or raylang changes
	@tmp=$$(mktemp -d) && \
	if [ -d $(SHARED) ]; then cp -R $(SHARED) $$tmp/; fi && \
	ray bundle --ios && \
	if [ -d $$tmp/xcshareddata ]; then \
		cp -R $$tmp/xcshareddata $(IOS)/$(APP).xcodeproj/ && echo "kept the shared Xcode scheme"; \
	fi; status=$$?; rm -rf $$tmp; exit $$status

ios-lib: ## Rebuild the iPhone static library (after UI or backend changes); Xcode project untouched
	ray build --native --lib --release --target aarch64-apple-ios -o $(IOS)/libs/libray_app.a

ios-lib-sim: ## Rebuild the simulator static library
	ray build --native --lib --release --target aarch64-apple-ios-sim -o $(IOS)/libs-sim/libray_app.a

ios-libs: ios-lib ios-lib-sim ## Rebuild both static libraries

ios-sim-build: ios-lib-sim ## Build the app for the simulator (unsigned)
	cd $(IOS) && xcodebuild -project $(APP).xcodeproj -target $(APP) -sdk iphonesimulator \
		-configuration Debug build CODE_SIGNING_ALLOWED=NO

# ---- Android ----

bundle-android: ## (Re)generate the Gradle project in Ray808-android/ (arm64)
	ray bundle --android --android-abi arm64

android-apk: ## Build the debug APK from Ray808-android/
	cd $(ANDROID) && gradle assembleDebug
