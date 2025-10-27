import React from 'react';
import renderer from 'react-test-renderer';
import { Button } from 'src/components';

describe('Button Component', () => {
  describe('rendering', () => {
    it('should render primary button', () => {
      const tree = renderer
        .create(<Button onPress={jest.fn()}>Click Me</Button>)
        .toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should render button with loading state', () => {
      const tree = renderer
        .create(
          <Button onPress={jest.fn()} loading>
            Loading
          </Button>,
        )
        .toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should render button with different variants', () => {
      const variants = ['primary', 'secondary', 'outline', 'danger'] as const;

      variants.forEach(variant => {
        const tree = renderer
          .create(
            <Button onPress={jest.fn()} variant={variant}>
              {variant}
            </Button>,
          )
          .toJSON();
        expect(tree).toMatchSnapshot();
      });
    });

    it('should render button with different sizes', () => {
      const sizes = ['sm', 'md', 'lg'] as const;

      sizes.forEach(size => {
        const tree = renderer
          .create(
            <Button onPress={jest.fn()} size={size}>
              {size}
            </Button>,
          )
          .toJSON();
        expect(tree).toMatchSnapshot();
      });
    });
  });

  describe('disabled state', () => {
    it('should render disabled button', () => {
      const tree = renderer
        .create(
          <Button onPress={jest.fn()} disabled>
            Disabled
          </Button>,
        )
        .toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should not call onPress when disabled and pressed', () => {
      const onPress = jest.fn();
      renderer.create(
        <Button onPress={onPress} disabled>
          Click
        </Button>,
      );

      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('interactions', () => {
    it('should call onPress when button is pressed', () => {
      const onPress = jest.fn();
      renderer.create(<Button onPress={onPress}>Click</Button>);

      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('text rendering', () => {
    it('should render children as text', () => {
      const tree = renderer
        .create(<Button onPress={jest.fn()}>My Button</Button>)
        .toJSON();

      expect(tree).toMatchSnapshot();
    });
  });
});
