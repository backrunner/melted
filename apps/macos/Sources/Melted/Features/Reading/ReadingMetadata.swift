// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct ReadingMetadata: View {
    let item: Briefing
    let termName: (String?) -> String
    @Binding var evidenceOpen: Bool
    let openSource: (URL) -> Void
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    var body: some View {
        VStack(alignment: .leading, spacing: MeltedReading.blockInset) {
            Rectangle()
                .fill(palette.separator.opacity(0.25))
                .frame(height: 1)
                .padding(.vertical, 12)

            VStack(alignment: .leading, spacing: 8) {
                if let category = item.categoryId {
                    informationField("分类", values: [termName(category)])
                }
                if !item.tagIds.isEmpty {
                    informationField("标签", values: item.tagIds.map { termName($0) })
                }
                if !item.subjectIds.isEmpty {
                    informationField("关注", values: item.subjectIds.map { termName($0) })
                }
            }
            ReadingEvidence(item: item, evidenceOpen: $evidenceOpen, openSource: openSource)
            if item.isDemo {
                Text("开发样例，用于体验阅读与筛选。内容由项目编写，未经模型处理。")
                    .font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary)
                    .lineSpacing(MeltedReading.titleLineSpacing)
            }
        }
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
