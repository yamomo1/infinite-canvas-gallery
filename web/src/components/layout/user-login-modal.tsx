import { useState } from "react";
import { Alert, Button, Form, Input, Modal } from "antd";
import { useTranslation } from "react-i18next";

import { useUserStore } from "@/stores/use-user-store";

type LoginFormValues = { username: string; password: string };

export function UserLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const login = useUserStore((state) => state.login);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form] = Form.useForm<LoginFormValues>();

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            setError(null);
            await login(values.username, values.password);
            form.resetFields();
            setSubmitting(false);
            onClose();
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
            onCancel={onClose}
            confirmLoading={submitting}
            okText={t("topNav.user.login")}
            cancelText={t("common.cancel")}
            destroyOnHidden
            forceRender
        >
            {error ? (
                <Alert type="error" showIcon message={error} className="mb-3" />
            ) : null}
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
