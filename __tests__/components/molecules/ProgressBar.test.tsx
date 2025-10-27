import React from 'react';
import renderer from 'react-test-renderer';
import { ProgressBar } from 'src/components';

describe('ProgressBar Component', () => {
  describe('rendering', () => {
    it('should render progress bar', () => {
      const tree = renderer.create(<ProgressBar percentage={50} />).toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should render with label', () => {
      const tree = renderer
        .create(<ProgressBar percentage={75} label="Health" />)
        .toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should render with percentage display', () => {
      const tree = renderer
        .create(<ProgressBar percentage={60} showPercentage />)
        .toJSON();
      expect(tree).toMatchSnapshot();
    });
  });

  describe('percentage clamping', () => {
    it('should clamp percentage to 0 minimum', () => {
      const tree = renderer.create(<ProgressBar percentage={-10} />).toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should clamp percentage to 100 maximum', () => {
      const tree = renderer.create(<ProgressBar percentage={150} />).toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should handle valid percentages', () => {
      const percentages = [0, 25, 50, 75, 100];

      percentages.forEach(percentage => {
        const tree = renderer
          .create(<ProgressBar percentage={percentage} />)
          .toJSON();
        expect(tree).toMatchSnapshot();
      });
    });
  });

  describe('styling', () => {
    it('should accept custom color', () => {
      const tree = renderer
        .create(<ProgressBar percentage={50} color="#ff6b6b" />)
        .toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should accept custom height', () => {
      const tree = renderer
        .create(<ProgressBar percentage={50} height={20} />)
        .toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should apply custom style', () => {
      const customStyle = { marginVertical: 20 };
      const tree = renderer
        .create(<ProgressBar percentage={50} style={customStyle} />)
        .toJSON();

      expect(tree).toMatchSnapshot();
    });
  });
});
