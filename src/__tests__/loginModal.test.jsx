/**
 * loginModal.test.jsx
 *
 * Component tests for the auth UI. The AuthContext is mocked so we can
 * inspect what gets passed to signIn / signUp / signInWithGoogle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock AuthContext.useAuth — we want to verify what LoginModal passes in,
// not actually exercise Supabase.
const signUp = vi.fn(() => Promise.resolve({ error: null }));
const signIn = vi.fn(() => Promise.resolve({ error: null }));
const signInWithGoogle = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("../lib/AuthContext.jsx", () => ({
  useAuth: () => ({ signUp, signIn, signInWithGoogle }),
}));

import LoginModal from "../lib/LoginModal.jsx";

beforeEach(() => {
  signUp.mockClear();
  signIn.mockClear();
  signInWithGoogle.mockClear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("LoginModal — sign-in mode", () => {
  it("does NOT show the marketing consent checkbox", () => {
    render(<LoginModal onClose={() => {}} />);
    expect(screen.queryByText(/early user/i)).toBeNull();
  });

  it("calls signIn on submit (no consent passed)", async () => {
    const user = userEvent.setup();
    render(<LoginModal onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/email/i),    "test@example.com");
    await user.type(screen.getByPlaceholderText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(signIn).toHaveBeenCalledOnce();
    expect(signIn).toHaveBeenCalledWith({ email: "test@example.com", password: "secret123" });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("toggling to Sign up reveals the consent checkbox (pre-checked)", async () => {
    const user = userEvent.setup();
    render(<LoginModal onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDefined();
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText(/early user/i)).toBeDefined();
  });
});

describe("LoginModal — sign-up mode", () => {
  it("calls signUp with marketingConsent=true by default", async () => {
    const user = userEvent.setup();
    render(<LoginModal onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    await user.type(screen.getByPlaceholderText(/display name/i), "Diego");
    await user.type(screen.getByPlaceholderText(/email/i),        "diego@x.com");
    await user.type(screen.getByPlaceholderText(/password/i),     "abc12345");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(signUp).toHaveBeenCalledOnce();
    expect(signUp).toHaveBeenCalledWith({
      email: "diego@x.com",
      password: "abc12345",
      displayName: "Diego",
      marketingConsent: true,
    });
  });

  it("calls signUp with marketingConsent=false when user unchecks the box", async () => {
    const user = userEvent.setup();
    render(<LoginModal onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    await user.click(screen.getByRole("checkbox")); // uncheck

    await user.type(screen.getByPlaceholderText(/display name/i), "Anna");
    await user.type(screen.getByPlaceholderText(/email/i),        "anna@x.com");
    await user.type(screen.getByPlaceholderText(/password/i),     "abc12345");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(signUp).toHaveBeenCalledWith({
      email: "anna@x.com",
      password: "abc12345",
      displayName: "Anna",
      marketingConsent: false,
    });
  });

  it("shows confirmation screen after successful signup", async () => {
    const user = userEvent.setup();
    render(<LoginModal onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    await user.type(screen.getByPlaceholderText(/display name/i), "Diego");
    await user.type(screen.getByPlaceholderText(/email/i),        "diego@x.com");
    await user.type(screen.getByPlaceholderText(/password/i),     "abc12345");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/check your email/i)).toBeDefined();
    expect(screen.getByText(/diego@x.com/)).toBeDefined();
  });

  it("shows error message when signUp returns an error", async () => {
    signUp.mockResolvedValueOnce({ error: { message: "Email already in use" } });
    const user = userEvent.setup();
    render(<LoginModal onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    await user.type(screen.getByPlaceholderText(/display name/i), "Diego");
    await user.type(screen.getByPlaceholderText(/email/i),        "dupe@x.com");
    await user.type(screen.getByPlaceholderText(/password/i),     "abc12345");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/email already in use/i)).toBeDefined();
    // Should NOT have shown the success screen
    expect(screen.queryByText(/check your email/i)).toBeNull();
  });
});

describe("LoginModal — Google OAuth", () => {
  it("passes marketingConsent=false in sign-in mode", async () => {
    const user = userEvent.setup();
    render(<LoginModal onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInWithGoogle).toHaveBeenCalledOnce();
    expect(signInWithGoogle).toHaveBeenCalledWith({ marketingConsent: false });
  });

  it("passes marketingConsent=true in sign-up mode (when checkbox is checked)", async () => {
    const user = userEvent.setup();
    render(<LoginModal onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInWithGoogle).toHaveBeenCalledWith({ marketingConsent: true });
  });

  it("respects user unchecking before clicking Google", async () => {
    const user = userEvent.setup();
    render(<LoginModal onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    await user.click(screen.getByRole("checkbox")); // uncheck
    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInWithGoogle).toHaveBeenCalledWith({ marketingConsent: false });
  });
});
