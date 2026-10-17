// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import MeltedCore

enum FailureSource: Equatable {
    case discovery
    case restore
    case login(AuthenticationMethod)
    case refresh
}

/// A connection failure described for the reader first: what happened, what to do,
/// and the raw status only if they open the detail.
struct WorkspaceFailure: Equatable {
    enum Kind: Equatable {
        case invalidAddress
        case cannotReach
        case offline
        case hostNotFound
        case incompatible
        case sessionExpired
        case registrationClosed
        case authMethodUnavailable
        case busy
        case lessThan
        case unexpected
    }

    let kind: Kind
    let technical: String?
    let source: FailureSource

    var message: String {
        switch kind {
        case .invalidAddress: "服务器地址无法使用"
        case .cannotReach: "无法连接到服务器"
        case .offline: "当前没有网络连接"
        case .hostNotFound: "找不到这台服务器"
        case .incompatible: "服务器版本不兼容"
        case .sessionExpired: "登录状态已失效"
        case .registrationClosed: "此服务器未开放注册"
        case .authMethodUnavailable: "登录方式已停用"
        case .busy: "服务器正忙"
        case .lessThan: "无法访问钥匙串"
        case .unexpected: "服务器暂时无法完成请求"
        }
    }

    var guidance: String {
        switch kind {
        case .invalidAddress:
            "使用 HTTPS 地址；本机可用 http://127.0.0.1:8421"
        case .cannotReach:
            "检查地址、端口、证书和服务器运行状态"
        case .offline:
            "联网后重试"
        case .hostNotFound:
            "检查地址拼写和 DNS 设置"
        case .incompatible:
            "更新 Melted 或服务器后重试"
        case .sessionExpired:
            "请重新登录"
        case .registrationClosed:
            "联系运营者创建账户"
        case .authMethodUnavailable:
            "重新获取或切换登录方式"
        case .busy:
            "稍后重试"
        case .lessThan:
            "检查钥匙串后重新登录"
        case .unexpected:
            "稍后重试，仍失败可向运营者提供错误详情"
        }
    }

    /// Which controls make sense right now, so the user is never left without a way forward.
    var offersRetry: Bool {
        switch kind {
        case .cannotReach, .offline, .busy, .unexpected, .sessionExpired: true
        default: false
        }
    }

    var offersReverify: Bool {
        switch kind {
        case .incompatible, .authMethodUnavailable, .registrationClosed: true
        default: false
        }
    }

    var offersChangeServer: Bool {
        switch source {
        case .discovery, .restore: true
        default: false
        }
    }
}
