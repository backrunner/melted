# Historical Contour-era fixture; not compatible with the current liquid API.
# Use ../animation-audit/build-preview.py and MeltedDesignSystemTests instead.
from pathlib import Path
import subprocess, plistlib
repo=Path.cwd()
root=repo/'apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem'
files=['Tokens.swift','MeltedScreen.swift','MeltedMark.swift','MeltedWordmark.swift','MeltedButtonStyles.swift','EmptyState.swift','Motion/MeltedMotionStyles.swift','Motion/MeltedBackdrop.swift','Motion/MeltedLiquid.swift','Motion/MeltedLiquidContour.swift']
app=repo/'build/ViscousMeltPreview.app/Contents'
(app/'MacOS').mkdir(parents=True,exist_ok=True)
subprocess.run(['swiftc','-parse-as-library','-o',str(app/'MacOS/Preview')]+[str(root/f) for f in files]+[str(Path(__file__).with_name('Preview.swift'))],check=True)
(app/'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'org.melted.viscous-melt-preview','CFBundleName':'ViscousMeltPreview','CFBundleExecutable':'Preview','CFBundlePackageType':'APPL','LSMinimumSystemVersion':'14.0','NSHighResolutionCapable':True}))
subprocess.run(['codesign','--force','--sign','-',str(app.parent)],check=True)
