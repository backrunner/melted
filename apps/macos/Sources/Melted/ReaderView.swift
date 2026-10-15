import AppKit
import SwiftUI
import MeltedCore
import MeltedDesignSystem
import MeltedRendering

struct ReaderView: View {
    @ObservedObject var model: WorkspaceModel
    let compact: Bool
    @Environment(\.colorScheme) private var scheme
    @AppStorage("readingScale") private var scale = 1.0
    @State private var evidenceOpen = false
    @State private var externalURL: URL?
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    var body: some View {
        VStack(spacing: 0) {
            if compact {
                HStack(spacing: 8) {
                    Button {
                        model.selectedID = nil
                    } label: {
                        Label("返回", systemImage: "chevron.left")
                            .labelStyle(.titleAndIcon)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(palette.accent)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.horizontal, MeltedReading.compactInset)
                .padding(.top, 16)
                .padding(.bottom, 12)
            }
            if model.loadingDetail {
                LoadingState("正在载入正文…")
            } else if let item = model.detail {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: MeltedReading.sectionSpacing) {
                            readerHeader(item).id("reading-top")
                            ReadingMarkdown(item.markdown, scale: scale)
                            VStack(alignment: .leading, spacing: MeltedReading.blockInset) {
                                Rectangle()
                                    .fill(palette.separator.opacity(0.25))
                                    .frame(height: 1)
                                    .padding(.vertical, 12)

                                VStack(alignment: .leading, spacing: 8) {
                                    if let category = item.categoryId {
                                        informationField("分类", values: [model.termName(category)])
                                    }
                                    if !item.tagIds.isEmpty {
                                        informationField("标签", values: item.tagIds.map { model.termName($0) })
                                    }
                                    if !item.subjectIds.isEmpty {
                                        informationField("关注", values: item.subjectIds.map { model.termName($0) })
                                    }
                                }
                                DisclosureGroup(isExpanded: $evidenceOpen) {
                                    VStack(alignment: .leading, spacing: 16) {
                                        ForEach(Array(item.evidence.enumerated()), id: \.offset) { index, evidence in
                                            VStack(alignment: .leading, spacing: 12) {
                                                // Evidence number badge
                                                HStack(spacing: 10) {
                                                    ZStack {
                                                        Circle()
                                                            .fill(palette.accent.opacity(0.12))
                                                        Text("\(index + 1)")
                                                            .font(.system(size: 11, weight: .bold))
                                                            .foregroundStyle(palette.accent)
                                                    }
                                                    .frame(width: 24, height: 24)

                                                    Text(evidence.title)
                                                        .font(.system(size: 13.5, weight: .semibold))
                                                        .foregroundStyle(palette.text)
                                                }

                                                Text(evidence.excerpt)
                                                    .font(.system(size: 12.5))
                                                    .foregroundStyle(palette.secondary)
                                                    .textSelection(.enabled)
                                                    .lineSpacing(4)
                                                    .fixedSize(horizontal: false, vertical: true)

                                                if let url = SafeLinks.url(evidence.url) {
                                                    Button {
                                                        externalURL = url
                                                    } label: {
                                                        HStack(spacing: 6) {
                                                            Image(systemName: "link")
                                                                .font(.system(size: 11, weight: .semibold))
                                                            Text("查看来源")
                                                                .font(.system(size: 12, weight: .medium))
                                                        }
                                                        .foregroundStyle(palette.accent)
                                                        .padding(.horizontal, 10)
                                                        .padding(.vertical, 6)
                                                        .background(palette.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
                                                    }
                                                    .buttonStyle(.plain)
                                                }
                                            }
                                            .padding(18)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 12)
                                                    .strokeBorder(palette.separator.opacity(0.3), lineWidth: 0.5)
                                            )
                                        }
                                        if item.evidence.isEmpty {
                                            VStack(spacing: 8) {
                                                Image(systemName: "doc.text.magnifyingglass")
                                                    .font(.system(size: 24, weight: .light))
                                                    .foregroundStyle(palette.secondary.opacity(0.6))
                                                Text("暂无可查看的依据")
                                                    .font(.system(size: 13))
                                                    .foregroundStyle(palette.secondary)
                                            }
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 24)
                                        }
                                    }
                                    .padding(.top, 16)
                                } label: {
                                    HStack(spacing: 10) {
                                        Image(systemName: "doc.text.magnifyingglass")
                                            .font(.system(size: 13, weight: .medium))
                                            .foregroundStyle(palette.accent)
                                            .frame(width: 24, height: 24)

                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("事实依据")
                                                .font(.system(size: 13, weight: .semibold))
                                                .foregroundStyle(palette.text)
                                            if !requiresEvidenceNotice(item) {
                                                Text(item.evidenceLabel)
                                                    .font(.system(size: 11))
                                                    .foregroundStyle(palette.secondary)
                                            }
                                        }

                                        Spacer()

                                        Image(systemName: evidenceOpen ? "chevron.up" : "chevron.down")
                                            .font(.system(size: 10, weight: .semibold))
                                            .foregroundStyle(palette.secondary.opacity(0.6))
                                            .animation(.spring(response: 0.25, dampingFraction: 0.75), value: evidenceOpen)
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                                    .background(palette.canvas.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8)
                                            .strokeBorder(palette.separator.opacity(0.2), lineWidth: 0.5)
                                    )
                                }
                                .buttonStyle(.plain)
                                if item.isDemo {
                                    Text("开发样例，用于体验阅读与筛选。内容由项目编写，未经模型处理。")
                                        .font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary)
                                        .lineSpacing(MeltedReading.titleLineSpacing)
                                }
                            }
                        }
                        .padding(compact ? MeltedReading.compactInset : MeltedReading.contentInset)
                        .frame(maxWidth: MeltedLayout.readingMaximum, alignment: .leading)
                        .frame(maxWidth: .infinity, alignment: .top)
                    }
                    .onChange(of: item.id) { _, _ in evidenceOpen = false; proxy.scrollTo("reading-top", anchor: .top) }
                }
            } else {
                EmptyState(
                    icon: "doc.text",
                    title: "选择一条内容开始阅读",
                    description: "整理后的信息会在这里展开"
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(palette.surface)
        .foregroundStyle(palette.text)
        .onChange(of: model.selectedID) { _, _ in evidenceOpen = false }
        .environment(\.openURL, OpenURLAction { url in
            guard let safe = SafeLinks.url(url.absoluteString) else { return .discarded }
            externalURL = safe; return .handled
        })
        .confirmationDialog("在浏览器中打开来源？", isPresented: Binding(get: { externalURL != nil }, set: { if !$0 { externalURL = nil } })) {
            if let url = externalURL { Button("打开链接") { NSWorkspace.shared.open(url); externalURL = nil } }
            Button("取消", role: .cancel) { externalURL = nil }
        } message: { Text(externalURL?.absoluteString ?? "") }
    }

    private func readerHeader(_ item: Briefing) -> some View {
        VStack(alignment: .leading, spacing: MeltedReading.headingBodySpacing) {
            Text(item.title)
                .font(.system(size: MeltedType.title * scale, weight: .semibold))
                .lineSpacing(MeltedReading.titleLineSpacing * scale)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled).accessibilityAddTraits(.isHeader)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: MeltedReading.blockInset) {
                    updatedTime(item)
                    Spacer(minLength: MeltedReading.blockInset)
                    readingActions(item)
                }
                VStack(alignment: .leading, spacing: MeltedReading.headingBodySpacing) {
                    updatedTime(item)
                    readingActions(item)
                }
            }
            if requiresEvidenceNotice(item) {
                Text(item.evidenceLabel)
                    .font(.system(size: MeltedType.control))
                    .foregroundStyle(palette.warning)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func updatedTime(_ item: Briefing) -> some View {
        let format: Date.FormatStyle = Calendar.current.isDate(item.updatedAt, equalTo: .now, toGranularity: .year)
            ? .dateTime.month().day().hour().minute()
            : .dateTime.year().month().day().hour().minute()
        return Text(item.updatedAt, format: format)
            .font(.system(size: MeltedType.metadata))
            .foregroundStyle(palette.secondary)
            .fixedSize()
            .help("更新时间 \(item.updatedAt.formatted(date: .complete, time: .shortened))")
            .accessibilityLabel("更新时间 \(item.updatedAt.formatted(date: .complete, time: .shortened))")
    }

    private func readingActions(_ item: Briefing) -> some View {
        HStack(spacing: 8) {
            // 只保留收藏按钮，更低调的样式
            Button {
                Task { await model.updateState(saved: !item.state.saved) }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: item.state.saved ? "bookmark.fill" : "bookmark")
                        .font(.system(size: 11, weight: .medium))
                    Text(item.state.saved ? "已收藏" : "收藏")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundStyle(item.state.saved ? palette.accent : palette.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(item.state.saved ? palette.accent.opacity(0.08) : palette.canvas.opacity(0.5))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .strokeBorder(
                            item.state.saved ? palette.accent.opacity(0.25) : palette.separator.opacity(0.2),
                            lineWidth: 0.5
                        )
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.state.saved ? "取消收藏" : "收藏")
            .help(item.state.saved ? "取消收藏" : "收藏这条资讯")

            if model.mutating {
                ProgressView()
                    .controlSize(.small)
                    .tint(palette.accent)
                    .accessibilityLabel("正在保存")
            }
        }
        .disabled(model.mutating)
        .animation(.spring(response: 0.25, dampingFraction: 0.75), value: model.mutating)
        .animation(.spring(response: 0.25, dampingFraction: 0.75), value: item.state.saved)
    }

    private func requiresEvidenceNotice(_ item: Briefing) -> Bool {
        // Only these explicitly non-warning states may move below the article.
        // New/unknown states remain visible before the body.
        !["not_applicable", "corroborated"].contains(item.evidenceStatus)
    }

    private func informationField(_ title: String, values: [String]) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(palette.secondary.opacity(0.8))
                .frame(width: 50, alignment: .leading)
            if title == "分类", let category = values.first {
                CategoryLabel(category, isSelected: false)
            }
            else {
                Text(values.joined(separator: "、"))
                    .font(.system(size: 11.5))
                    .foregroundStyle(palette.secondary)
                    .textSelection(.enabled)
            }
        }
    }
}
