import {
  Alert,
  Box,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconChartBar } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const form = useForm({
    initialValues: { phone: "0501234567", pin: "1234" },
    validate: {
      phone: (v) => (v.trim().length >= 7 ? null : "Enter a valid phone number"),
      pin: (v) => (v.length >= 4 ? null : "PIN must be at least 4 digits"),
    },
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setError("");
    setLoading(true);
    try {
      await signIn(values.phone.trim(), values.pin);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  });

  return (
    <Box
      mih="100vh"
      style={{
        background:
          "linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #14532d 100%)",
      }}
    >
      <Center mih="100vh" p="md">
        <Paper shadow="xl" radius="lg" p="xl" w="100%" maw={420}>
          <Stack align="center" gap="xs" mb="xl">
            <ThemeIcon size={56} radius="xl" color="green" variant="light">
              <IconChartBar size={28} />
            </ThemeIcon>
            <Title order={2}>DAPOS Portal</Title>
            <Text c="dimmed" ta="center">
              Sign in with your store phone number and PIN
            </Text>
          </Stack>

          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Phone"
                placeholder="0501234567"
                {...form.getInputProps("phone")}
              />
              <PasswordInput
                label="PIN"
                placeholder="••••"
                {...form.getInputProps("pin")}
              />
              {error ? (
                <Alert color="red" variant="light">
                  {error}
                </Alert>
              ) : null}
              <Button type="submit" color="green" size="md" loading={loading}>
                Sign in
              </Button>
            </Stack>
          </form>
        </Paper>
      </Center>
    </Box>
  );
}
