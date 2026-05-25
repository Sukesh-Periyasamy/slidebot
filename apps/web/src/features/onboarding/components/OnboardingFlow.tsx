import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/features/settings/store/settingsStore';
import { Button } from '@/shared/components/Button';
import { Sparkles, Users, Presentation, MousePointer2 } from 'lucide-react';

const STEPS = [
  {
    title: 'Welcome to SlideBot',
    description: 'The fastest way to collaborate and present online. Let\'s show you around!',
    icon: Sparkles,
  },
  {
    title: 'Workspaces',
    description: 'Organize your presentations into Workspaces and invite your team to collaborate.',
    icon: Users,
  },
  {
    title: 'Presenter Mode',
    description: 'Take control of the room. When you present, everyone follows your screen automatically.',
    icon: Presentation,
  },
  {
    title: 'Live Annotations',
    description: 'Draw, highlight, and point with laser cursors in real-time with your audience.',
    icon: MousePointer2,
  },
];

export function OnboardingFlow() {
  const { hasCompletedOnboarding, completeOnboarding } = useSettingsStore();
  const [currentStep, setCurrentStep] = useState(0);

  if (hasCompletedOnboarding) return null;

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(s => s + 1);
    } else {
      completeOnboarding();
    }
  };

  const currentStepData = STEPS[currentStep];
  if (!currentStepData) return null;
  const StepIcon = currentStepData.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-md bg-surface-900 border border-surface-800 shadow-2xl rounded-xl overflow-hidden focus:outline-none p-6 text-center flex flex-col items-center"
      >
        <div className="h-16 w-16 bg-brand-500/10 rounded-full flex items-center justify-center text-brand-400 mb-4">
          <StepIcon size={32} />
        </div>
        
        <h2 id="onboarding-title" className="text-xl font-semibold text-surface-50 mb-2">
          {currentStepData.title}
        </h2>
        <p className="text-surface-400 text-sm mb-8 leading-relaxed px-4 min-h-[60px]">
          {currentStepData.description}
        </p>
        
        <div className="w-full flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 rounded-full transition-all ${i === currentStep ? 'w-6 bg-brand-500' : 'w-1.5 bg-surface-700'}`} 
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={completeOnboarding}>Skip</Button>
            <Button variant="primary" onClick={handleNext}>
              {currentStep === STEPS.length - 1 ? 'Get Started' : 'Next'}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
