# Ray808 — common tasks. `make` (or `make help`) lists them.
#
# Generated projects (Ray808.app, Ray808-ios/, Ray808-android/) are not versioned: create
# them once with the bundle-* targets. After that, a change to the React page or to src/*.ray
# only needs the static library rebuilt (ios-lib), which never touches the Xcode project or
# its signing (keep DEVELOPMENT_TEAM in Ray808-ios/App.xcconfig, not in Xcode's Signing tab).

APP     := Ray808
IOS     := $(APP)-ios
ANDROID := $(APP)-android
NPM     := npm --prefix frontend
LOCAL_NETWORK_TEXT := Ray808 connects to the Vite dev server on your computer while you develop the app (hot reload).

.DEFAULT_GOAL := help
.PHONY: help install dev dev-device test test-backend lint build smoke icon \
        bundle-macos bundle-ios ios-lib ios-lib-sim ios-libs ios-local-network ios-sim-build \
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

bundle-ios: ## (Re)generate the Xcode project in Ray808-ios/ — only when [app] or raylang changes
	ray bundle --ios
	@$(MAKE) --no-print-directory ios-local-network

ios-lib: ## Rebuild the iPhone static library (after UI or backend changes); Xcode project untouched
	ray build --native --lib --release --target aarch64-apple-ios -o $(IOS)/libs/libray_app.a

ios-lib-sim: ## Rebuild the simulator static library
	ray build --native --lib --release --target aarch64-apple-ios-sim -o $(IOS)/libs-sim/libray_app.a

ios-libs: ios-lib ios-lib-sim ## Rebuild both static libraries

ios-local-network: ## Add NSLocalNetworkUsageDescription to the shell Info.plist (needed for dev-device)
	@if /usr/libexec/PlistBuddy -c "Print :NSLocalNetworkUsageDescription" $(IOS)/Shell/Info.plist >/dev/null 2>&1; then \
		echo "NSLocalNetworkUsageDescription already set"; \
	else \
		plutil -insert NSLocalNetworkUsageDescription -string "$(LOCAL_NETWORK_TEXT)" $(IOS)/Shell/Info.plist && \
		echo "NSLocalNetworkUsageDescription added"; \
	fi

ios-sim-build: ios-lib-sim ## Build the app for the simulator (unsigned)
	cd $(IOS) && xcodebuild -project $(APP).xcodeproj -target $(APP) -sdk iphonesimulator \
		-configuration Debug build CODE_SIGNING_ALLOWED=NO

# ---- Android ----

bundle-android: ## (Re)generate the Gradle project in Ray808-android/ (arm64)
	ray bundle --android --android-abi arm64

android-apk: ## Build the debug APK from Ray808-android/
	cd $(ANDROID) && gradle assembleDebug
