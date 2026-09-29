#!/usr/bin/env python3
"""Wire the app icon into the Xcode project that `ray bundle --ios` generates.

The bundle writes Shell/Assets.xcassets/AppIcon.appiconset/icon_1024.png but the generated
project.pbxproj neither references the asset catalog nor has a Resources build phase, and
no build setting names the icon set, so the app installs without an icon (README, finding
15). This adds the three things, idempotently; `make bundle-ios` runs it after every
regeneration. Usage: scripts/ios-icon.py [Ray808-ios]
"""
import re
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else "Ray808-ios")
pbx_path = next(root.glob("*.xcodeproj/project.pbxproj"))
xcconfig = root / "App.xcconfig"
pbx = pbx_path.read_text()

FILE_REF = "0000000000000000000000F9"
BUILD_FILE = "0000000000000000000000B4"
PHASE = "0000000000000000000000E3"

if FILE_REF not in pbx:
    pbx = pbx.replace(
        "/* End PBXFileReference section */",
        f"\t\t{FILE_REF} /* Assets.xcassets */ = {{isa = PBXFileReference; "
        f"lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = \"<group>\"; }};\n"
        "/* End PBXFileReference section */",
    )
    pbx = pbx.replace(
        "/* End PBXBuildFile section */",
        f"\t\t{BUILD_FILE} /* Assets.xcassets in Resources */ = {{isa = PBXBuildFile; "
        f"fileRef = {FILE_REF} /* Assets.xcassets */; }};\n/* End PBXBuildFile section */",
    )
    pbx = pbx.replace(
        "/* Begin PBXSourcesBuildPhase section */",
        "/* Begin PBXResourcesBuildPhase section */\n"
        f"\t\t{PHASE} /* Resources */ = {{\n"
        "\t\t\tisa = PBXResourcesBuildPhase;\n"
        "\t\t\tbuildActionMask = 2147483647;\n"
        "\t\t\tfiles = (\n"
        f"\t\t\t\t{BUILD_FILE} /* Assets.xcassets in Resources */,\n"
        "\t\t\t);\n"
        "\t\t\trunOnlyForDeploymentPostprocessing = 0;\n"
        "\t\t};\n"
        "/* End PBXResourcesBuildPhase section */\n\n"
        "/* Begin PBXSourcesBuildPhase section */",
    )
    # The Resources phase after Frameworks, and the catalog inside the Shell group.
    pbx = re.sub(
        r"(\t\t\t\t0000000000000000000000E1 /\* Frameworks \*/,\n)",
        r"\1" + f"\t\t\t\t{PHASE} /* Resources */,\n",
        pbx,
        count=1,
    )
    pbx = pbx.replace(
        "\t\t\t\t0000000000000000000000F4 /* Info.plist */,\n\t\t\t);\n\t\t\tpath = Shell;",
        "\t\t\t\t0000000000000000000000F4 /* Info.plist */,\n"
        f"\t\t\t\t{FILE_REF} /* Assets.xcassets */,\n\t\t\t);\n\t\t\tpath = Shell;",
    )
    pbx_path.write_text(pbx)
    print(f"{pbx_path}: asset catalog and Resources phase added")
else:
    print(f"{pbx_path}: already wired")

cfg = xcconfig.read_text()
if "ASSETCATALOG_COMPILER_APPICON_NAME" not in cfg:
    cfg = cfg.rstrip("\n") + "\n// The icon set of Shell/Assets.xcassets (scripts/ios-icon.py wires the catalog).\nASSETCATALOG_COMPILER_APPICON_NAME = AppIcon\n"
    xcconfig.write_text(cfg)
    print(f"{xcconfig}: ASSETCATALOG_COMPILER_APPICON_NAME added")
else:
    print(f"{xcconfig}: already set")
