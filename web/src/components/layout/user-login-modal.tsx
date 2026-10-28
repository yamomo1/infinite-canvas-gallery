import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Modal } from "antd";
import { useTranslation } from "react-i18next";

import { useLoginModalStore } from "@/stores/use-login-modal";
import { useUserStore } from "@/stores/use-user-store";

type LoginFormValues = { username: string; password: string };

// 全局唯一的登录弹窗：开关由 useLoginModalStore 控制，
// 顶栏、画布深链等任意位置都能唤起。
export function UserLoginModal() {
    const { t } = useTranslation();
    const open = useLoginModalStore((state) => state.open);
    const reason = useLoginModalStore((state) => state.reason);
    const close = useLoginModalStore((state) => state.close);
    const login = useUserStore((state) => state.login);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form] = Form.useForm<LoginFormValues>();

    useEffect(() => {
        if (open) setError(null);
    }, [open]);

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            setError(null);
            await login(values.username, values.password);
            form.resetFields();
            setSubmitting(false);
            close();
        } catch (err) {
            setSubmitting(false);
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    return (
        <Modal
            open={open}
            title={t("topNav.user.login")}
            onOk={handleSubmit}
            onCancel={close}
            confirmLoading={submitting}
            okText={t("topNav.user.login")}
            cancelText={t("common.cancel")}
            destroyOnHidden
            forceRender
        >
            {reason ? <p className="mb-3 text-stone-500 text-sm">{reason}</p> : null}
            {error ? <Alert type="error" showIcon message={error} className="mb-3" /> : null}
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item
                    name="username"
                    label={t("topNav.user.username")}
                    rules={[{ required: true, message: t("topNav.user.usernameRequired") }]}
                >
                    <Input autoFocus allowClear />
                </Form.Item>
                <Form.Item
                    name="password"
                    label={t("topNav.user.password")}
                    rules={[{ required: true, message: t("topNav.user.passwordRequired") }]}
                >
                    <Input.Password allowClear />
                </Form.Item>
            </Form>
        </Modal>
    );
}
