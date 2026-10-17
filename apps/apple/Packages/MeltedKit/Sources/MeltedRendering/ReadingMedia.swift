// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

struct ReadingMedia: View {
    let media: EmbeddedMedia
    let scale: CGFloat
    @Environment(\.colorScheme) private var scheme
    @Environment(\.openURL) private var openURL
    @State private var image: CGImage?
    @State private var active = false
    @State private var loading = false
    @State private var failed = false
    @State private var attempt = 0
    @State private var width: CGFloat = 0
    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeltedMedia.contentGap) {
            if let image {
                Image(image, scale: 1, label: Text(media.title.isEmpty ? "图片" : media.title)).resizable().scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: MeltedMedia.maximumImageHeight)
                    .accessibilityLabel(media.title.isEmpty ? "图片" : media.title)
                    .accessibilityAddTraits(.isImage)
            } else if active && media.kind != .image && !failed {
                // No overlays on the provider's player or controls.
                EmbeddedPlayer(media: media, loaded: { loading = false }, failed: { loading = false; failed = true }, openURL: { openURL($0) })
                    .id(attempt)
                    .frame(height: max(MeltedMedia.minimumPlayerHeight, width * 9 / 16))
                    .accessibilityLabel("\(media.provider) 视频播放器")
            } else {
                placeholder
            }
            if image != nil || (active && media.kind != .image && !failed) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline) { caption; Spacer(); actions }
                    VStack(alignment: .leading, spacing: MeltedMedia.contentGap) { caption; actions }
                }
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .task(id: active ? attempt : -1) {
            guard active, media.kind == .image else { return }
            do {
                let value = try await RemoteImageLoader.load(media.sourceURL)
                try Task.checkCancellation()
                image = value; loading = false
            } catch {
                guard !Task.isCancelled else { return }
                failed = true; loading = false
            }
        }
        .onDisappear { active = false; image = nil; loading = false; failed = false }
    }

    private var placeholder: some View {
        VStack(alignment: .leading, spacing: MeltedMedia.contentGap) {
            HStack(alignment: .top, spacing: MeltedMedia.contentGap) {
                Image(systemName: media.kind == .image ? "photo" : "play.rectangle")
                    .font(.system(size: MeltedMedia.iconSize)).foregroundStyle(palette.secondary).accessibilityHidden(true)
                caption
            }
            Text(failed ? "加载失败，可以重试或在浏览器中打开" : "点击后连接 \(media.provider)，会向该网站提供网络地址")
                .font(.system(size: MeltedType.metadata * scale)).foregroundStyle(palette.secondary)
                .fixedSize(horizontal: false, vertical: true)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: MeltedMedia.contentGap) { loadButton; sourceButton }
                VStack(alignment: .leading, spacing: MeltedMedia.contentGap) { loadButton; sourceButton }
            }
        }
        .padding(MeltedMedia.placeholderInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.canvas, in: RoundedRectangle(cornerRadius: MeltedMedia.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: MeltedMedia.cornerRadius).strokeBorder(palette.separator, lineWidth: 1))
    }

    private var caption: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !media.title.isEmpty {
                Text(media.title).font(.system(size: MeltedType.metadata * scale, weight: .medium))
                    .foregroundStyle(palette.text).fixedSize(horizontal: false, vertical: true)
            }
            Text(media.provider).font(.system(size: MeltedType.metadata * scale)).foregroundStyle(palette.secondary)
        }
    }
    private var loadButton: some View {
        Button {
            failed = false; loading = true; active = true; attempt += 1
        } label: {
            HStack(spacing: 8) {
                if loading { ProgressView().controlSize(.small) }
                Text(loading ? "正在加载…" : failed ? "重新加载" : media.kind == .image ? "加载图片" : "加载播放器")
            }.frame(minHeight: MeltedMedia.actionHeight)
        }
        .buttonStyle(MeltedSecondaryButtonStyle()).disabled(loading)
    }
    private var sourceButton: some View {
        Button("在浏览器中打开") { openURL(media.sourceURL) }
            .buttonStyle(.plain).foregroundStyle(palette.accent)
            .font(.system(size: MeltedType.control * scale))
            .frame(minHeight: MeltedMedia.actionHeight)
    }
    private var actions: some View {
        HStack(spacing: MeltedMedia.contentGap) {
            if loading { ProgressView().controlSize(.small).accessibilityLabel("正在加载播放器") }
            sourceButton
            Button(media.kind == .image ? "收起图片" : "关闭播放器") { active = false; image = nil; loading = false; failed = false }
                .buttonStyle(.plain).foregroundStyle(palette.accent)
                .font(.system(size: MeltedType.control * scale))
                .frame(minHeight: MeltedMedia.actionHeight)
        }
    }
}
