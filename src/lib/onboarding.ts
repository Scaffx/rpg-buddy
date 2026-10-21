type OnboardingProfileLike = {
  onboarding_completed?: boolean | null;
  starter_class?: string | null;
};

export function hasCompletedOnboarding(profile: OnboardingProfileLike | null | undefined, userId: string): boolean {
  void userId;
  // O marcador local acelera a apresentação, mas não prova escolha de classe.
  return profile?.onboarding_completed === true &&
    typeof profile.starter_class === "string" &&
    ["guerreiro", "mago", "gatuno", "ferreiro", "clerico", "novato", "arqueiro"]
      .includes(profile.starter_class);
}

export function markOnboardingCompletedLocal(userId: string, starterClass: string, starterItem: string): void {
  localStorage.setItem(`starter_class_v1_${userId}`, starterClass);
  localStorage.setItem(`starter_item_v1_${userId}`, starterItem);
  localStorage.setItem(`onboarding_v1_${userId}`, "done");
}
